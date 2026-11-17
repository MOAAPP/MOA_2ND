import {afterEach,expect,it,vi} from 'vitest';
import {getDeviceId} from '../src/lib/id';
afterEach(()=>vi.unstubAllGlobals());
it('retains existing dashboard device identity when connecting durable learning',()=>{
  const id='a1055d72-961b-4ccb-9b65-e8301687aa15';
  const values=new Map([['moa.device',id]]);
  vi.stubGlobal('localStorage',{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value)});
  expect(getDeviceId()).toBe(id);
  expect(values.get('pb.device')).toBe(id);
});
it('keeps an existing durable card identity when both versions have been used',()=>{
  const id='b1055d72-961b-4ccb-9b65-e8301687aa15';
  const values=new Map([['pb.device',id],['moa.device','a1055d72-961b-4ccb-9b65-e8301687aa15']]);
  vi.stubGlobal('localStorage',{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value)});
  expect(getDeviceId()).toBe(id);
});
