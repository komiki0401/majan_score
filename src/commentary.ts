import {standings,orderedGames,type State} from './domain';
import {commentaryPhrases} from './commentary-phrases';
function leaderCommentary(state:State):string{
 const ranking=standings(state).filter(p=>p.count);
 if(!ranking.length)return 'いよいよ開幕！まだ全員が優勝候補。牌を混ぜる手つきは、もうプロ級！？';
 const top=ranking[0],ties=ranking.filter(p=>Math.abs(p.total-top.total)<.0001);
 if(ties.length>1){const names=ties.slice(0,2).map(p=>`${p.name}さん`).join('と');return `${names}${ties.length>2?'たち':''}が同率トップ！仲良し首位争い、抜け出すのは誰だ！？`;}
 if(ranking.length===1)return `${top.name}さんが先陣を切った！みんなの記録がそろうまで、王者の椅子を温めておきましょう。`;
 const games=orderedGames(state),previous=standings({...state,games:games.slice(0,-1)}).filter(p=>p.count);
 if(previous.length&&previous[0].id!==top.id&&top.total>ranking[1].total)return `${top.name}さんが首位に浮上！ここで主役交代、ドラマの脚本を書いてますねぇ！`;
 const lead=top.total-ranking[1].total;
 if(lead>=50)return `${top.name}さんがダントツトップ！麻雀がうまい…さてはプロなのかぁ？？`;
 if(lead>=20)return `${top.name}さんがトップを快走！牌と会話できるって噂、本当ですか！？`;
 if(lead<10)return `${top.name}さんが僅差でトップ！次の半荘で主役交代も？お茶を飲む暇もありません！`;
 return `${top.name}さんがトップ！この勢い、点棒にもファンクラブができそうです！`;
}

function baseCommentaryLines(state:State):string[]{
 const ranking=standings(state).filter(p=>p.count),lines=[leaderCommentary(state)];
 if(!ranking.length)return [...lines,'最初の半荘は、今日の物語の第1話。主役の登場を待っています！','点棒はまだ横一線。最初に抜け出すのは誰でしょう？','準備はできましたか？深呼吸ひとつ、楽しい対局のはじまりです。'];
 if(ranking.length===1)return [...lines,`${ranking[0].name}さんの一局が、記録の最初の1ページに。ここからどんな物語になるでしょう？`,'成績は一局ずつ積み重なるもの。次の記録も楽しみです！'];
 const previous=standings({...state,games:orderedGames(state).slice(0,-1)}).filter(p=>p.count);
 for(let i=1;i<ranking.length-1;i++){
  const a=ranking[i],b=ranking[i+1],gap=Number((a.total-b.total).toFixed(4));
  if(gap<=10){lines.push(`${a.name}さんと${b.name}さんが接戦だ〜！${gap===0?'同点でにらみ合い':`差はわずか${gap}pt`}。この順位争い、目が離せません！`);break;}
 }
 const last=orderedGames(state).at(-1);
 for(const row of last?.rows??[]){const p=ranking.find(p=>p.id===row.playerId);if(p&&p.total<ranking[0].total&&row.rank===1)lines.push(`${p.name}さんが直近の半荘でトップ！逆襲のスイッチ、入りましたねぇ！`);}
 const rising=ranking.slice(1).find(p=>{const old=previous.find(q=>q.id===p.id);return old&&previous.filter(q=>q.total>old.total).length>ranking.filter(q=>q.total>p.total).length;});
 if(rising)lines.push(`${rising.name}さんが順位を上げてきた！静かに忍び寄る追い上げ、忍者なのかぁ？？`);
 const chaser=ranking[1];if(chaser.total<ranking[0].total)lines.push(`${chaser.name}さんが追いかける！次の主役を狙って、牌も作戦会議中！？`);
 const lastPlayer=ranking.at(-1)!;if(ranking.length>2&&lastPlayer.total<ranking[0].total)lines.push(`${lastPlayer.name}さん、ここからの巻き返しに期待！逆転ドラマは後半からが本番です！`);
 const top=ranking[0],lead=Number((top.total-chaser.total).toFixed(4));
 if(lead===0)lines.push('首位の椅子に相席中！同点のままでは終われない、次の半荘が楽しみです。');
 else if(lead<=10)lines.push(`${chaser.name}さんから首位まで${lead}pt！追う側も守る側も、気の抜けない展開です。`);
 else lines.push(`${top.name}さんが首位をキープ。追いかける皆さん、ここから見せ場を作りましょう！`);
 lines.push(`${top.name}さん、首位の景色はいかがですか？後ろからの足音にもご注目！`);
 for(const p of ranking.slice(1,-1).filter(p=>p.total<top.total))lines.push(`${p.name}さんにもスポットライト！上位をうかがう一局に期待が高まります。`);
 lines.push(`${lastPlayer.name}さん、焦らず自分のペースで。次の半荘が新しいスタートです！`);
 const games=orderedGames(state);
 const winners=last?.rows.filter(row=>row.rank===1)??[];
 for(const row of winners){const p=ranking.find(p=>p.id===row.playerId);if(p)lines.push(`${p.name}さんが直近の半荘で${row.point>0?`＋${Number(row.point.toFixed(4))}ptを獲得`:'トップ'}！この一局が、次の流れにつながるでしょうか？`);}
 const winCounts=ranking.map(p=>({...p,wins:games.reduce((count,g)=>count+Number(g.rows.some(row=>row.playerId===p.id&&row.rank===1)),0)}));
 const mostWins=Math.max(...winCounts.map(p=>p.wins));
 if(mostWins>0){const leaders=winCounts.filter(p=>p.wins===mostWins);lines.push(`${leaders.map(p=>p.name+'さん').join('・')}がトップ回数${mostWins}回で最多！勝ち星の数にも注目です。`);}
 for(const p of ranking){
  const results=games.flatMap(g=>g.rows.filter(row=>row.playerId===p.id));
  let streak=0;for(let i=results.length-1;i>=0&&results[i].rank===1;i--)streak++;
  if(streak>=2)lines.push(`${p.name}さんは自身の直近${streak}対局で連続トップ！次の登場にも視線が集まります。`);
 }
 lines.push(`ここまで${games.length}半荘、${ranking.length}人の成績を記録。積み重ねた一局一局が、今のランキングを作っています。`);
 lines.push('順位表の数字の向こうに、それぞれの一局。次は誰の見せ場になるでしょう？','トップも接戦も巻き返しも、みんなが今日の主役。最後まで楽しんでいきましょう！','流れを変えるきっかけは、次の一局かもしれません。卓の物語はまだまだ続きます！');
 return [...new Set(lines)];
}
type PhraseValues=Record<string,string|number>;
function renderPhrase(line:string,values:PhraseValues){return line.replace(/\{(\w+)\}/g,(_,key:string)=>{if(!(key in values))throw Error('Unknown commentary placeholder: '+key);return String(values[key]);});}
/** Alternate situations, then deduplicate: long rotations do not become one player's monologue. */
function interleave(primary:string[],pools:string[][]):string[]{
 const lines=[primary[0]],groups=[primary.slice(1),...pools],length=Math.max(...groups.map(group=>group.length));
 for(let i=0;i<length;i++)for(const group of groups)if(group[i])lines.push(group[i]);
 return [...new Set(lines)];
}
export function commentaryLines(state:State):string[]{
 const primary=baseCommentaryLines(state),ranking=standings(state).filter(player=>player.count);
 if(!ranking.length)return interleave(primary,[[...commentaryPhrases.opening]]);
 const games=orderedGames(state),last=games.at(-1),top=ranking[0],previous=standings({...state,games:games.slice(0,-1)}).filter(player=>player.count);
 const number=(value:number)=>Number(value.toFixed(4));
 const points=(value:number)=>(value>0?'+':'')+number(value);
 const names=(players:typeof ranking)=>players.slice(0,2).map(player=>player.name+'さん').join('と')+(players.length>2?'たち':'');
 const values=(player:typeof top):PhraseValues=>({name:player.name,total:points(player.total),count:player.count});
 const bank=(key:keyof typeof commentaryPhrases,data:PhraseValues)=>commentaryPhrases[key].map(line=>renderPhrase(line,data));
 const roundRobin=(key:keyof typeof commentaryPhrases,data:PhraseValues[])=>data.length?commentaryPhrases[key].map((line,i)=>renderPhrase(line,data[i%data.length])):[];
 const pools:string[][]=[[...commentaryPhrases.general]],ties=ranking.filter(player=>Math.abs(player.total-top.total)<.0001);
 if(ranking.length===1){pools.push(bank('solo',values(top)));}
 else{
  const second=ranking[1],gap=number(top.total-second.total);
  pools.push(ties.length>1?bank('tied',{names:names(ties)}):bank('leader',values(top)));
  if(gap>0)pools.push(bank('chaser',{...values(second),gap}));
  pools.push(roundRobin('middle',ranking.slice(1,-1).filter(player=>player.total<top.total).map(values)));
  const tail=ranking.at(-1)!;if(tail.total<top.total)pools.push(bank('comeback',values(tail)));
  for(let i=1;i<ranking.length-1;i++){const a=ranking[i],b=ranking[i+1],distance=number(a.total-b.total);if(distance<=10){pools.push(bank('close',{a:a.name,b:b.name,gapText:distance===0?'同点':distance+'pt差'}));break;}}
  const winners=(last?.rows??[]).filter(row=>row.rank===1).flatMap(row=>{const player=ranking.find(player=>player.id===row.playerId);return player?[{...values(player),points:points(row.point)}]:[];});
  pools.push(roundRobin('latest',winners));
  const wins=ranking.map(player=>({...player,wins:games.reduce((count,game)=>count+Number(game.rows.some(row=>row.playerId===player.id&&row.rank===1)),0)})),most=Math.max(...wins.map(player=>player.wins));
  if(most>0)pools.push(bank('wins',{names:names(wins.filter(player=>player.wins===most)),wins:most}));
  if(gap>=50)pools.push(bank('bigLead',{...values(top),gap}));else if(gap>0&&gap<=10)pools.push(bank('nearLead',{...values(top),gap}));
  const rising=ranking.slice(1).filter(player=>{const old=previous.find(candidate=>candidate.id===player.id);return old&&previous.filter(candidate=>candidate.total>old.total).length>ranking.filter(candidate=>candidate.total>player.total).length;});
  pools.push(roundRobin('rising',rising.map(values)));
  const streaks=ranking.flatMap(player=>{const results=games.flatMap(game=>game.rows.filter(row=>row.playerId===player.id));let streak=0;for(let i=results.length-1;i>=0&&results[i].rank===1;i--)streak++;return streak>=2?[{...values(player),streak}]:[];});
  pools.push(roundRobin('streak',streaks));
 }
 pools.push(bank('totals',{games:games.length,players:ranking.length}));
 return interleave(primary,pools);
}
export function liveCommentary(state:State,variant=0):string{const lines=commentaryLines(state);return lines[((variant%lines.length)+lines.length)%lines.length];}
