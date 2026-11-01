import {validDay} from './domain';
export function tournamentName(day:string,names:Iterable<string>=[]):string{
 if(!validDay(day))throw Error('有効な対局日を選択してください。');
 const date=new Date(day+'T00:00:00Z');
 const base=day.replaceAll('-','/')+'（'+'日月火水木金土'[date.getUTCDay()]+'）麻雀会';
 const used=new Set(names);let number=1,name=base;
 while(used.has(name)){number++;const suffix=number<=20?String.fromCodePoint(0x2460+number-1):number<=35?String.fromCodePoint(0x3251+number-21):number<=50?String.fromCodePoint(0x32b1+number-36):`（${number}）`;name=base+suffix;}
 return name;
}
