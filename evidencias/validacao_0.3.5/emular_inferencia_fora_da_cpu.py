"""Emula inferência fora da CPU (DirectML): estimate real 1x, depois reusa o resultado após 77 ms de espera."""
import sys, runpy, time
proj=sys.argv[1]; sys.path.insert(0, proj)
import rov_ai
real=rov_ai.RovAI.estimate
cache={}
def fake(self, frame):
    if 'r' not in cache: cache['r']=real(self, frame)
    time.sleep(.077); return cache['r']
rov_ai.RovAI.estimate=fake
sys.argv=[proj+'/benchmark_live.py']+sys.argv[2:]
import os; os.chdir(proj)
runpy.run_path(proj+'/benchmark_live.py', run_name='__main__')
