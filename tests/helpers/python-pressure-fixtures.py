"""Read-only AST-isolated original pressure oracle; never import the Discord bot/config."""
import ast,json,pathlib,types,typing,hashlib,sys
if len(sys.argv)!=2: raise SystemExit('Usage: python-pressure-fixtures.py /path/to/original-bot.py')
path=pathlib.Path(sys.argv[1])
source=path.read_bytes();tree=ast.parse(source)
names={'_clamp_int','_advance_scene_pressure','_add_scene_pressure','_reset_scene_pressure'}
functions=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in names]
assert {f.name for f in functions}==names
constants={}
for n in tree.body:
 if isinstance(n,ast.Assign):
  for target in n.targets:
   if isinstance(target,ast.Name) and target.id.startswith('SCENE_PRESSURE_'):
    constants[target.id]=ast.literal_eval(n.value)
roll=1
ns={**constants,'Any':typing.Any,'Optional':typing.Optional,'RPGSession':types.SimpleNamespace,'random':types.SimpleNamespace(randint=lambda a,b:roll),'logging':types.SimpleNamespace(info=lambda *a:None)}
exec(compile(ast.Module(body=functions,type_ignores=[]),'<python-pressure-oracle>','exec'),ns)
cases=[]
for chance in [0,4,25,90,100]:
 for margin in [-20,-3,0,3,20]:
  for critical in [False,True]:
   for roll in [1,12,25,50,100]:
    for turns in [0,3]:
     session=types.SimpleNamespace(scene_pressure_chance=chance,scene_pressure_turns=turns)
     result=ns['_advance_scene_pressure'](session,margin=margin,is_roll_bearing_event=not critical,is_critical_action=critical)
     cases.append({'chance':chance,'turns':turns,'margin':margin,'critical':critical,'roll':roll,'expected':{'chance':session.scene_pressure_chance,'turns':session.scene_pressure_turns,'roll':roll,'threshold':result['chance'],'triggered':result['triggered'],'suppressed':result['suppressed_by_critical']}})
pathlib.Path(__file__).with_name('python-pressure-fixtures.json').write_text(json.dumps({'sourceSha256':hashlib.sha256(source).hexdigest(),'cases':cases},indent=2)+'\n')
print(len(cases),'original Python pressure cases; source SHA256',hashlib.sha256(source).hexdigest())
