"""Read-only Monday reconciliation. Only demonstrably supplemental rows are added."""
from __future__ import annotations

import hashlib
import json
import os
import re
import uuid
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from pathlib import Path

import requests

try:
    import revenue_collector as revenue
except ImportError:
    from scripts import revenue_collector as revenue

BOARD_ID = '4984917746'
BOARD_URL = 'https://creatorsagency.monday.com/boards/' + BOARD_ID
RULE_VERSION = '2026-09-09.2'
COLUMNS = {'numbers': 'numbers', 'numbers7': 'numbers', 'creator_payment': 'numbers',
           'date': 'date', 'date4': 'date', 'status6': 'status', 'label': 'status',
           'invoice__0': 'text', 'text0': 'text'}
ITEM_FIELDS = 'id name updated_at state board{id} column_values{id text value} subitems{id}'
IMPACT_ALIASES = {'divvy': 'bill', 'divvybonus': 'bill', 'monarchmoney': 'monarch',
                  'rocketcard': 'rocket', 'sofix': 'sofi'}



def normalized(value):
    return re.sub(r'[^a-z0-9]', '', str(value).lower())


def valid_date(value):
    try:
        return bool(re.fullmatch(r'\d{4}-\d{2}-\d{2}', value) and date.fromisoformat(value))
    except (TypeError, ValueError):
        return False


def decimal_amount(value):
    if value is None or str(value).strip() == '':
        return None
    try:
        number = Decimal(str(value))
        if not number.is_finite():
            raise ValueError()
        return number
    except (InvalidOperation, ValueError):
        raise revenue.ConnectorError('validation')


def cents(value):
    result = int((value * 100).quantize(Decimal('1'), rounding=ROUND_HALF_UP))
    if abs(result) > 9_007_199_254_740_991:
        raise revenue.ConnectorError('validation')
    return result


def gross_amount(columns):
    gross = decimal_amount(columns.get('numbers'))
    if gross is not None:
        return cents(gross), 'gross'
    agency = decimal_amount(columns.get('numbers7'))
    creator = decimal_amount(columns.get('creator_payment'))
    if agency is not None:
        estimate = agency / Decimal('.20')
        if creator is not None and abs(cents(estimate) - cents(creator / Decimal('.80'))) > 2:
            return None, 'conflicting_split'
        return cents(estimate), 'ca_net_20pct'
    if creator is not None:
        return cents(creator / Decimal('.80')), 'creator_payout_80pct'
    return None, 'missing'


def _get(session, url, **kwargs):
    response = session.get(url, timeout=60, **kwargs)
    response.raise_for_status()
    return response.json()


def fetch_monday(key, known_ids=()):
    session = requests.Session()
    session.headers.update({'Authorization': key, 'API-Version': '2026-04'})

    def query(q, variables=None):
        response = session.post('https://api.monday.com/v2', json={'query': q, 'variables': variables or {}}, timeout=60)
        response.raise_for_status()
        data = response.json()
        if data.get('errors') or not isinstance(data.get('data'), dict):
            raise revenue.ConnectorError('malformed_response')
        return data['data']

    boards = query('query{boards(ids:[' + BOARD_ID + ']){id columns{id type} items_page(limit:500){cursor items{' + ITEM_FIELDS + '}}}}')['boards']
    if len(boards) != 1:
        raise revenue.ConnectorError('validation')
    schema = {c['id']: c['type'] for c in boards[0]['columns']}
    if any(schema.get(k) != v for k, v in COLUMNS.items()):
        raise revenue.ConnectorError('validation')
    page = boards[0]['items_page']
    rows, cursors, ids = [], set(), set()
    while True:
        for item in page['items']:
            if item['id'] in ids or item.get('subitems'):
                raise revenue.ConnectorError('validation')
            ids.add(item['id']); rows.append(item)
        cursor = page['cursor']
        if cursor is None:
            break
        if not cursor or cursor in cursors or not page['items']:
            raise revenue.ConnectorError('validation')
        cursors.add(cursor)
        page = query('query($c:String!){next_items_page(limit:500,cursor:$c){cursor items{' + ITEM_FIELDS + '}}}', {'c': cursor})['next_items_page']
    # Preserve history when rows are archived. A deletion/move is never silently zeroed.
    missing = sorted(set(known_ids) - ids)
    for offset in range(0, len(missing), 100):
        batch = missing[offset:offset+100]
        found = query('query($ids:[ID!]!){items(ids:$ids,limit:100,exclude_nonactive:false){' + ITEM_FIELDS + '}}', {'ids': batch})['items']
        if {i['id'] for i in found} != set(batch):
            raise revenue.ConnectorError('validation')
        for item in found:
            if item['state'] not in ('active', 'archived') or item['board']['id'] != BOARD_ID or item.get('subitems'):
                raise revenue.ConnectorError('validation')
            rows.append(item)
    if not rows:
        raise revenue.ConnectorError('empty_data')
    return rows


def fetch_close_evidence(key, now):
    session = requests.Session(); session.auth = (key, '')
    rows, ids, offset = [], set(), 0
    while True:
        data = _get(session, revenue.CLOSE_BASE_URL + '/opportunity/', params={
            '_limit': 100, '_skip': offset, 'status_type': 'won', 'date_won__lte': now.date().isoformat(),
            '_fields': 'id,note,lead_id,lead_name,date_won,value,value_currency,value_period,custom',
        })
        if not isinstance(data.get('data'), list) or not isinstance(data.get('has_more'), bool):
            raise revenue.ConnectorError('malformed_response')
        for item in data['data']:
            if item['id'] in ids or item['value_currency'] != 'USD' or item['value_period'] != 'one_time':
                raise revenue.ConnectorError('validation')
            ids.add(item['id']); rows.append(item)
        if not data['has_more']:
            break
        if not data['data']:
            raise revenue.ConnectorError('validation')
        offset += 100
    return rows


def fetch_impact_evidence(sid, password, now):
    def year_report(year):
        session = requests.Session(); session.auth = (sid, password); session.headers['Accept'] = 'application/json'
        data = _get(session, f'https://api.impact.com/Mediapartners/{sid}/Reports/partner_performance_by_program', params={
            'START_DATE': f'{year}-01-01', 'END_DATE': min(f'{year}-12-31', now.date().isoformat()), 'PageSize': 20000,
        })
        rows = data.get('Records')
        if not isinstance(rows, list) or int(data.get('@numpages', 1)) > 1 or int(data.get('@total', len(rows))) != len(rows):
            raise revenue.ConnectorError('validation')
        return [{'name': r['Campaign'].strip(), 'id': str(r['campaign_id']), 'year': year,
                 'grossCents': cents(decimal_amount(r['Total_Cost']))} for r in rows]
    with ThreadPoolExecutor(max_workers=3) as pool:
        return [row for rows in pool.map(year_report, range(2020, now.year + 1)) for row in rows]


def program_and_creator(name):
    parts = re.split(r'\s+[xX]\s+', name, maxsplit=1)
    return parts[0].strip(), parts[1].strip() if len(parts) > 1 else ''


def item_fingerprint(item):
    columns = {c['id']: c['text'] for c in item['column_values'] if c['id'] in COLUMNS}
    return hashlib.sha256(json.dumps({'name':item['name'],'columns':columns}, sort_keys=True).encode()).hexdigest()


def brand_matches(brand, value):
    # Word boundaries prevent Course matching Coursera, or Extra matching "extra deliverables".
    return bool(brand and (normalized(brand) == normalized(value)
        or re.match(r'^' + re.escape(brand) + r'(?:\b|\s|\()', value, re.I)))


def close_candidates(brand, creator, opportunities, creator_aliases):
    candidate = []
    def creator_name(value):
        cleaned = normalized(re.sub(r'\([^)]*\)|\[[^]]*\]', '', value))
        return creator_aliases.get(cleaned, cleaned)
    target = creator_name(creator)
    for deal in opportunities:
        if not deal.get('value') or not (brand_matches(brand, deal.get('lead_name', ''))
                                       or brand_matches(brand, deal.get('note', ''))):
            continue
        _, note_creator = program_and_creator(deal.get('note', ''))
        creators = [note_creator]
        for key, value in deal.items():
            if key.startswith('custom.') and isinstance(value, list):
                creators.extend(v for v in value if isinstance(v, str))
        cleaned = [creator_name(v) for v in creators if v]
        # Unknown roster or a company-wide contract is potentially overlapping.
        if not cleaned or any(v in ('ca', 'creatorsagency') or target in v or v in target for v in cleaned if v):
            candidate.append(deal)
    return candidate


def reconcile(items, opportunities, impact, now, policy, *, msn_from_monday=False):
    rows = []
    for item in items:
        columns = {c['id']: c['text'] for c in item['column_values']}
        gross, basis = gross_amount(columns)
        name = item['name']; brand, creator = program_and_creator(name)
        program = normalized(brand)
        payment = columns.get('date', '')
        row = {'itemId': item['id'], 'name': name, 'invoice': columns.get('invoice__0', ''),
               'paymentDate': payment, 'periodDate': columns.get('date4', ''),
               'basis': basis, 'disposition': 'review', 'reason': 'unclassified_program',
               'references': [], 'updatedAt': item.get('updated_at', ''), 'state': item.get('state', 'active')}
        if gross is not None:
            row['grossCents'] = gross
        if msn_from_monday and (program.startswith('microsoftstart') or program == 'msn'):
            row['source'] = 'msn'
        if columns.get('status6') != 'Paid In Full':
            row.update(disposition='unpaid', reason='not_paid_in_full')
        elif not valid_date(payment):
            row['reason'] = 'missing_or_invalid_payment_date'
        elif payment > now.date().isoformat():
            row.update(disposition='future', reason='future_payment')
        else:
            # Network coverage is checked across ALL years: a prior-year earning paid
            # this year is already accounted for, not new YTD revenue to add again.
            check_program = IMPACT_ALIASES.get(program, program)
            impact_matches = [r for r in impact if r['grossCents'] != 0 and (
                normalized(r['name']) == check_program or
                re.match(r'^' + re.escape(brand) + r'\b', r['name'], re.I) or
                (program in IMPACT_ALIASES and normalized(r['name']).startswith(check_program)))]
            covered_source = None
            if columns.get('label') == 'Impact':
                if impact_matches:
                    covered_source = 'impact'
                    row['references'] = sorted({'impact:program:' + r['id'] for r in impact_matches})
                else:
                    row['reason'] = 'impact_coverage_unconfirmed'
            elif program.startswith('microsoftstart') or program == 'msn':
                if msn_from_monday:
                    row['source'] = 'msn'
                    if gross is None:
                        row['reason'] = basis
                    else:
                        row.update(disposition='included', reason='msn_paid_monday')
                    rows.append(row)
                    continue
                covered_source = 'msn'; row['references'] = ['counter:MSN:verified-lifetime-baseline-and-B9']
            elif program.startswith('moneycom'):
                covered_source = 'adsbymoney'; row['references'] = ['adsbymoney:publisher_dashboard/campaigns']
            elif re.search(r'red\s*ventures|bankrate|creditcards\.com', name, re.I):
                covered_source = 'redventures'; row['references'] = ['redventures:property:50812']
            if covered_source:
                row.update(disposition='covered', reason='already_in_direct_feed', source=covered_source)
            elif columns.get('label') == 'Impact':
                pass
            elif impact_matches:
                row.update(reason='possible_impact_overlap', references=sorted({'impact:program:' + r['id'] for r in impact_matches}))
            else:
                candidates = close_candidates(brand, creator, opportunities, policy['creatorAliases'])
                # An explicit opportunity ID in the invoice notes is definitive;
                # name/creator/value similarity is only a reason to hold for review.
                exact = [d for d in candidates if d['id'] in columns.get('text0', '')]
                if exact:
                    row.update(disposition='covered', reason='linked_close_contract', source='close', references=[d['id'] for d in exact])
                elif candidates:
                    row.update(reason='possible_close_overlap', references=[d['id'] for d in candidates])
                elif gross is None:
                    row['reason'] = basis
                elif program in policy['programs']:
                    row.update(disposition='included', reason='supplemental_affiliate')
        rows.append(row)
    # An invoice can contain many legitimate lines. Only identical line identities
    # are ambiguous; do not collapse an entire invoice to one payment.
    def fingerprint(r):
        return (normalized(r['name']), r['invoice'], r['paymentDate'], r['periodDate'], r.get('grossCents'))
    counts = Counter(fingerprint(r) for r in rows if r['disposition'] in ('included', 'review'))
    for row in rows:
        if row['disposition'] == 'included' and counts[fingerprint(row)] > 1:
            row.update(disposition='review', reason='possible_duplicate_monday_line')
    # Private, evidence-backed exceptions apply to the reviewed financial inputs
    # only. A later change to the row invalidates that decision automatically.
    originals = {item['id']:item for item in items}
    for row in rows:
        override = policy.get('overrides', {}).get(row['itemId'])
        # Old Counter coverage exceptions cannot override the new MSN source.
        if msn_from_monday and row.get('source') == 'msn':
            continue
        if not override or row['disposition'] in ('unpaid','future'):
            continue
        if override['fingerprint'] != item_fingerprint(originals[row['itemId']]):
            row.update(disposition='review', reason='override_input_changed')
            continue
        disposition = override['disposition']
        if disposition == 'included' and (row.get('grossCents') is None or not valid_date(row['paymentDate'])):
            continue
        row.update(disposition=disposition, references=override['references'])
        row.pop('source', None)
        if disposition == 'included':
            row['reason'] = 'supplemental_affiliate'
        elif disposition == 'covered':
            row['source'] = override['source']
            row['reason'] = 'linked_close_contract' if override['source'] == 'close' else 'already_in_direct_feed'
        else:
            row['reason'] = 'coverage_review'
    return sorted(rows, key=lambda r: int(r['itemId']))


def summarize(rows, snapshot_date):
    included = [r for r in rows if r['disposition'] == 'included']
    lifetime = sum(r['grossCents'] for r in included)
    ytd = sum(r['grossCents'] for r in included if r['paymentDate'][:4] == snapshot_date[:4])
    if lifetime < 0 or ytd < 0:
        raise revenue.ConnectorError('validation')
    estimated = [r for r in included if r['basis'] != 'gross']
    return {'totalRows': len(rows), 'includedRows': len(included),
            'reviewRows': sum(r['disposition'] == 'review' for r in rows),
            'coveredRows': sum(r['disposition'] == 'covered' for r in rows),
            'estimatedRows': len(estimated), 'estimatedAllTimeUsd': sum(r['grossCents'] for r in estimated)/100,
            'totalYtdUsd': ytd/100, 'totalAllTimeUsd': lifetime/100}


def reconciliation_inputs(items, impact, policy):
    """Minimal immutable facts for server-side reclassification; no credentials.

    Decimal conversion and private-override fingerprints stay in this collector.
    All Close matching, date eligibility, duplicate detection and overrides are
    reevaluated by the server against these exact captured facts.
    """
    result = []
    for item in items:
        columns = {c['id']: c['text'] for c in item['column_values']}
        gross, basis = gross_amount(columns)
        brand, creator = program_and_creator(item['name'])
        program = normalized(brand)
        check = IMPACT_ALIASES.get(program, program)
        refs = sorted({'impact:program:' + r['id'] for r in impact if r['grossCents'] != 0 and (
            normalized(r['name']) == check or re.match(r'^' + re.escape(brand) + r'\b', r['name'], re.I)
            or (program in IMPACT_ALIASES and normalized(r['name']).startswith(check)))})
        row = {'itemId': item['id'], 'name': item['name'], 'invoice': columns.get('invoice__0', ''),
               'paymentDate': columns.get('date', ''), 'periodDate': columns.get('date4', ''),
               'basis': basis, 'updatedAt': item.get('updated_at', ''), 'state': item.get('state', 'active'),
               'paid': columns.get('status6') == 'Paid In Full', 'impactLabel': columns.get('label') == 'Impact',
               'impactRefs': refs, 'closeNotes': columns.get('text0', ''),
               'supplemental': program in policy['programs']}
        if gross is not None:
            row['grossCents'] = gross
        override = policy.get('overrides', {}).get(item['id'])
        if override:
            row['override'] = {'matches': override['fingerprint'] == item_fingerprint(item),
                               'disposition': override['disposition'], 'references': override['references']}
            if 'source' in override:
                row['override']['source'] = override['source']
        result.append(row)
    return {'items': result, 'creatorAliases': policy['creatorAliases']}


def collect(now, state_path=None, policy_path=None, *, secrets=None, opportunities=None,
            msn_from_monday=False, read_only=False):
    state_root = Path(os.environ.get('REVENUE_STATE_DIR', str(Path.home() / 'Library/Application Support/CreatorsAgency/revenue-collector')))
    policy_file = Path(policy_path or os.environ.get('MONDAY_REVENUE_POLICY_FILE', str(state_root / 'monday-policy.json')))
    policy = json.loads(policy_file.read_text())
    if (not isinstance(policy.get('programs'), list) or not policy['programs']
        or any(not isinstance(p, str) or normalized(p) != p for p in policy['programs'])
        or not isinstance(policy.get('creatorAliases'), dict)
        or any(not isinstance(k, str) or not isinstance(v, str) or normalized(k) != k or normalized(v) != v for k,v in policy['creatorAliases'].items())):
        raise revenue.ConnectorError('validation')
    overrides = policy.get('overrides', {})
    if not isinstance(overrides, dict):
        raise revenue.ConnectorError('validation')
    for item_id, override in overrides.items():
        if (not item_id.isdigit() or not isinstance(override, dict)
            or not re.fullmatch(r'[a-f0-9]{64}', override.get('fingerprint',''))
            or override.get('disposition') not in ('included','covered','review')
            or not isinstance(override.get('references'), list) or not 1 <= len(override['references']) <= 50
            or any(not isinstance(ref,str) or not ref.strip() for ref in override['references'])
            or (override['disposition'] == 'covered' and override.get('source') not in revenue.SOURCE_NAMES)):
            raise revenue.ConnectorError('validation')
    policy_digest = hashlib.sha256(json.dumps(policy, sort_keys=True).encode()).hexdigest()[:12]
    state = Path(state_path) if state_path else None
    known = json.loads(state.read_text()) if state and state.exists() else []
    if not isinstance(known, list) or any(not isinstance(i, str) or not i.isdigit() for i in known):
        raise revenue.ConnectorError('validation')
    with ThreadPoolExecutor(max_workers=3) as pool:
        items_future = pool.submit(fetch_monday, revenue.read_secret('monday'), known)
        close_future = None if opportunities is not None else pool.submit(fetch_close_evidence, secrets.close_api_key if secrets else revenue.read_secret('close'), now)
        impact_future = pool.submit(fetch_impact_evidence, secrets.impact_sid if secrets else revenue.read_secret('impact_sid'), secrets.impact_reporting_password if secrets else revenue.read_secret('impact_reporting_password'), now)
        items = items_future.result()
        opportunities = opportunities if close_future is None else close_future.result()
        impact = impact_future.result()
    rows = reconcile(items, opportunities, impact, now, policy, msn_from_monday=msn_from_monday)
    digest = hashlib.sha256(json.dumps(rows, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    result = {'auditId': str(uuid.uuid4()), 'snapshotDate': now.date().isoformat(),
              'fetchedAt': revenue.utc_iso(), 'ruleVersion': ('2026-09-18.msn-paid' if msn_from_monday else RULE_VERSION) + ':' + policy_digest, 'digest': digest,
              'closeEvidenceCount': len(opportunities), 'impactEvidenceCount': len(impact),
              'summary': summarize(rows, now.date().isoformat()), 'rows': rows}
    if msn_from_monday:
        result['reconciliationInputs'] = reconciliation_inputs(items, impact, policy)
    if state and not read_only:
        state.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        temporary = state.with_suffix('.tmp')
        descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(descriptor, 'w') as output:
            json.dump(sorted({i['id'] for i in items}), output)
        os.replace(temporary, state)
    return result


def post_audit(result, secret):
    header = {'x-activity-secret': secret}
    for offset in range(0, len(result['rows']), 100):
        response = requests.post(revenue.SITE_URL + '/revenue/monday/chunk', headers=header, json={
            'auditId': result['auditId'], 'index': offset//100, 'rows': result['rows'][offset:offset+100],
        }, timeout=60)
        response.raise_for_status()
    response = requests.post(revenue.SITE_URL + '/revenue/monday/complete', headers=header,
                             json={k:v for k,v in result.items() if k not in ('rows', 'reconciliationInputs', 'closeFacts')}, timeout=60)
    response.raise_for_status()
    if response.json().get('summary') != result['summary']:
        raise revenue.ConnectorError('validation')


def post_reconciliation_evidence(audit, secret):
    header = {'x-activity-secret': secret}
    inputs = audit['reconciliationInputs']
    counts = {}
    for kind, values in [('monday', inputs['items']), ('close', audit['closeFacts'])]:
        counts[kind] = (len(values) + 99) // 100
        for offset in range(0, len(values), 100):
            response = requests.post(revenue.SITE_URL + '/revenue/reconciliation/chunk', headers=header, json={
                'auditId': audit['auditId'], 'kind': kind, 'index': offset//100,
                'items': values[offset:offset+100] if kind == 'monday' else [],
                'close': values[offset:offset+100] if kind == 'close' else [],
            }, timeout=60)
            response.raise_for_status()
    response = requests.post(revenue.SITE_URL + '/revenue/reconciliation/complete', headers=header, json={
        'auditId': audit['auditId'], 'itemChunks': counts['monday'], 'closeChunks': counts['close'],
        'creatorAliases': inputs['creatorAliases'],
    }, timeout=60)
    response.raise_for_status()
