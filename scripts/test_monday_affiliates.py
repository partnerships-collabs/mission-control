import unittest
from datetime import datetime
from unittest.mock import patch
import test_revenue_collector  # Secret-free connector stubs.
import monday_affiliates as m

POLICY = {'programs':['snap','course','gelato'], 'creatorAliases':{}}
NOW = datetime(2026,9,9,tzinfo=m.revenue.CHICAGO)

def item(number='1', name='Snap x Creator One', **columns):
    values={'numbers':'100','status6':'Paid In Full','date':'2026-08-31','date4':'2026-07-31','label':'Direct','invoice__0':'A1',**columns}
    return {'id':number,'name':name,'state':'active','updated_at':'2026-09-01T00:00:00Z','column_values':[{'id':k,'text':v} for k,v in values.items()]}

def deal(name='Snap x Creator One', value=10000, **fields):
    return {'id':'oppo_example','note':name,'lead_name':name.split(' x ')[0],'value':value,**fields}

class ReconciliationTests(unittest.TestCase):
    def test_missing_gross_uses_user_approved_split_and_cents(self):
        self.assertEqual(m.gross_amount({'numbers7':'20'}),(10000,'ca_net_20pct'))
        self.assertEqual(m.gross_amount({'creator_payment':'122.82'}),(15353,'creator_payout_80pct'))
        self.assertEqual(m.gross_amount({'numbers':'0','numbers7':'20'}),(0,'gross'))
        self.assertEqual(m.gross_amount({'numbers':'80','numbers7':'20'}),(8000,'gross'))
        self.assertEqual(m.gross_amount({'numbers7':'20','creator_payment':'50'}),(None,'conflicting_split'))
        for value in ['NaN','Infinity','abc']:
            with self.assertRaises(m.revenue.ConnectorError):m.gross_amount({'numbers':value})

    def test_network_labels_and_direct_aliases_exclude_existing_sources(self):
        impact=[{'id':'1','name':'SoFi Creator','grossCents':10000,'year':2025}]
        rows=m.reconcile([item(name='SoFi x A',label='Impact'),item('2',name='Money.com x A'),
            item('3',name='Microsoft Start - Deficit',numbers='-.03'),item('4',name='LinkOffers x A (Red Ventures)')],[],impact,NOW,POLICY)
        self.assertEqual([r['source'] for r in rows],['impact','adsbymoney','msn','redventures'])
        self.assertEqual(m.summarize(rows,'2026-09-09')['totalAllTimeUsd'],0)

    def test_direct_platform_does_not_override_impact_evidence(self):
        rows=m.reconcile([item(name='Gelato x A')],[],[{'id':'22','name':'Gelato','year':2024,'grossCents':100}],NOW,POLICY)
        self.assertEqual(rows[0]['reason'],'possible_impact_overlap')
        self.assertEqual(rows[0]['disposition'],'review')

    def test_same_brand_and_creator_is_held_and_explicit_close_link_excluded(self):
        rows=m.reconcile([item(),item('2',text0='Invoice for oppo_example')],[deal()],[],NOW,POLICY)
        self.assertEqual(rows[0]['reason'],'possible_close_overlap')
        self.assertEqual(rows[1]['reason'],'linked_close_contract')
        self.assertEqual(m.summarize(rows,'2026-09-09')['includedRows'],0)

    def test_same_brand_different_creator_and_zero_dollar_opportunity_are_not_duplicates(self):
        for opportunity in [deal('Snap x Someone Else'),deal(value=0)]:
            rows=m.reconcile([item()],[opportunity],[],NOW,POLICY)
            self.assertEqual(rows[0]['disposition'],'included')

    def test_course_does_not_match_coursera(self):
        self.assertEqual(m.reconcile([item(name='Course x Creator One')],[deal('Coursera x Creator One')],[],NOW,POLICY)[0]['disposition'],'included')

    def test_creator_aliases_survive_renewal_suffixes(self):
        policy={**POLICY,'creatorAliases':{'shortname':'creatorone'}}
        rows=m.reconcile([item()],[deal('Snap x Short Name (renewal)')],[],NOW,policy)
        self.assertEqual(rows[0]['reason'],'possible_close_overlap')

    def test_reviewed_exception_expires_when_financial_inputs_change(self):
        original=item()
        policy={**POLICY,'overrides':{'1':{'fingerprint':m.item_fingerprint(original),'disposition':'included','references':['verified-invoice-A1']}}}
        self.assertEqual(m.reconcile([original],[deal()],[],NOW,policy)[0]['disposition'],'included')
        changed=item(numbers='200')
        self.assertEqual(m.reconcile([changed],[deal()],[],NOW,policy)[0]['reason'],'override_input_changed')
        self.assertEqual(m.reconcile([item(status6='Unpaid')],[deal()],[],NOW,policy)[0]['disposition'],'unpaid')

    def test_invoice_splits_are_kept_but_identical_lines_are_held(self):
        rows=m.reconcile([item(),item('2',name='Snap x Creator Two')],[],[],NOW,POLICY)
        self.assertEqual(m.summarize(rows,'2026-09-09')['totalAllTimeUsd'],200)
        rows=m.reconcile([item(),item('2')],[],[],NOW,POLICY)
        self.assertTrue(all(r['reason']=='possible_duplicate_monday_line' for r in rows))

    def test_receipt_date_year_rollover_unpaid_future_and_refunds(self):
        rows=m.reconcile([item(date='2025-12-31'),item('2',date='2026-01-01'),
            item('3',numbers='-10',invoice__0='REFUND'),item('4',status6='Unpaid'),item('5',date='2026-09-10')],[],[],NOW,POLICY)
        result=m.summarize(rows,'2026-09-09')
        self.assertEqual(result['totalAllTimeUsd'],190);self.assertEqual(result['totalYtdUsd'],90)

    def test_unknown_program_missing_date_and_missing_amount_need_review(self):
        rows=m.reconcile([item(name='New Network x A'),item('2',date=''),item('3',numbers='')],[],[],NOW,POLICY)
        self.assertEqual(m.summarize(rows,'2026-09-09')['reviewRows'],3)

    def test_collectors_include_monday_health_in_publishability(self):
        good=m.revenue.SourceHealth(1,'success','2026-09-09T17:05:00Z',False)
        health={name:good for name in m.revenue.SOURCE_NAMES}
        health['monday_affiliates']=m.revenue.SourceHealth(None,'failed','2026-09-09T17:05:00Z',False,'validation failed')
        payload=m.revenue.build_run_payload('run','2026-09-09T17:00:00Z','2026-09-09T17:10:00Z','2026-09-09',health,None)
        self.assertIn('monday_affiliates',payload['sourceHealth']);self.assertNotIn('closeLast30DayUsd',payload)

    def test_pagination_archived_history_and_missing_rows(self):
        archived={**item('9'),'board':{'id':m.BOARD_ID},'subitems':[],'state':'archived'}
        active={**item(),'board':{'id':m.BOARD_ID},'subitems':[]}
        responses=[{'boards':[{'columns':[{'id':k,'type':v} for k,v in m.COLUMNS.items()],
                    'items_page':{'cursor':'next','items':[active]}}]},
                   {'next_items_page':{'cursor':None,'items':[]}}, {'items':[archived]}]
        class Session:
            def __init__(self):self.headers={}
            def post(self,*args,**kwargs):
                data=responses.pop(0)
                return type('R',(),{'status_code':200,'raise_for_status':lambda self:None,'json':lambda self:{'data':data}})()
        with patch.object(m.requests,'Session',Session,create=True):
            self.assertEqual(len(m.fetch_monday('test',['9'])),2)
        responses.extend([{'boards':[{'columns':[{'id':k,'type':v} for k,v in m.COLUMNS.items()],
                         'items_page':{'cursor':None,'items':[active]}}]}, {'items':[]}])
        with patch.object(m.requests,'Session',Session,create=True), self.assertRaises(m.revenue.ConnectorError):m.fetch_monday('test',['9'])


if __name__=='__main__':unittest.main()
