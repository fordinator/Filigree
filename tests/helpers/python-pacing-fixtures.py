"""Generate parity fixtures from pure AST-selected original helpers; never import the bot."""
import ast,json,pathlib,sys
if len(sys.argv)!=2: raise SystemExit('Usage: python-pacing-fixtures.py /path/to/original-bot.py')
source=pathlib.Path(sys.argv[1]).read_text()
names={'_clamp_int','_success_percent_from_margin','_finale_decision'}
tree=ast.parse(source)
selected=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in names]
ns={'Any':object,'FINALE_MARGIN_TO_PERCENT':5,'FINALE_MIN_PERCENT':1,'FINALE_MAX_PERCENT':99}
exec(compile(ast.Module(body=selected,type_ignores=[]),'<pure-python-helpers>','exec'),ns)
cases=[]
for current in range(-30,31):
 for prior in [[],[0],[1],[-1],[9],[-9],[-3,-5],[7,8,9],[-8,2,1],[1,2],[0,1,0]]:
  d=ns['_finale_decision'](current,prior)
  cases.append({'current':current,'prior':prior,'expected':{'current':d['current_margin'],'average':d['other_average'],'determining':d['determining_margin'],'successPercent':d['success_percent'],'result':d['result']}})
out=pathlib.Path(__file__).with_name('python-pacing-fixtures.json')
out.write_text(json.dumps(cases,indent=2)+'\n')
print(f'{len(cases)} Python cases: {out}')
