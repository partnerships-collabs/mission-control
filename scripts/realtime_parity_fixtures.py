"""Secret-free Python oracle for the shared TypeScript reconciliation tests."""
import json
from test_monday_affiliates import item, deal, POLICY, NOW
import monday_affiliates as m

cases = []
def add(items, deals=(), impact=(), policy=POLICY):
    facts = [{**d, 'date_won':'2026-08-01', 'value_currency':'USD', 'value_period':'one_time',
              'creators':[v for k, values in d.items() if k.startswith('custom.') and isinstance(values,list) for v in values if isinstance(v,str)]} for d in deals]
    for d in facts:
        for k in list(d):
            if k.startswith('custom.'): del d[k]
    cases.append({**m.reconciliation_inputs(items, impact, policy), 'facts':facts,
                  'date':NOW.date().isoformat(), 'expected':m.reconcile(items,deals,impact,NOW,policy,msn_from_monday=True)})

for change in [{}, {'numbers':'0'}, {'numbers':'','numbers7':'20'}, {'numbers':'','creator_payment':'122.82'},
               {'numbers':'','numbers7':'20','creator_payment':'50'}, {'date':''}, {'date':'2027-01-01'}, {'status6':'Unpaid'}]:
    add([item(**change)])
for name in ['Snap x Creator One','Snap x Other','Coursera x Creator One','Snap x Short Name (renewal)', 'Snap x A X B']:
    add([item(),item('2',text0='oppo_example')],[deal(name)],policy={**POLICY,'creatorAliases':{'shortname':'creatorone'}})
add([item(),item('2')])
add([item(),item('2',name='Snap x Different')])
add([item(name='Microsoft Start - Deficit',numbers='-.03'),item('2',name='MSN x Creator',numbers='100')])
add([item(name='Money.com x A'),item('2',name='LinkOffers x A (Red Ventures)'),item('3',name='SoFi x A',label='Impact')],impact=[{'id':'1','name':'SoFi Creator','grossCents':100,'year':2025}])
add([item(name='Gelato x A')],impact=[{'id':'2','name':'Gelato','grossCents':100,'year':2024}])
add([item(label='Impact')])
add([item()],[deal(**{'custom.cf_creator':['Creator One']})])
for disposition in ['included','covered','review']:
    original=item()
    override={'fingerprint':m.item_fingerprint(original),'disposition':disposition,'references':['oppo_example']}
    if disposition=='covered':override['source']='close'
    policy={**POLICY,'overrides':{'1':override}}
    add([original],[deal()],policy=policy)
    add([item(numbers='200')],[deal()],policy=policy)
print(json.dumps(cases))
