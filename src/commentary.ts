import {standings,orderedGames,type State} from './domain';
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

export function commentaryLines(state:State):string[]{
 const ranking=standings(state).filter(p=>p.count),lines=[leaderCommentary(state)];
 if(!ranking.length)return [...lines,'最初の半荘は、今日の物語の第1話。主役の登場を待っています！','点棒はまだ横一線。最初に抜け出すのは誰でしょう？','準備はできましたか？深呼吸ひとつ、楽しい対局のはじまりです。'];
 if(ranking.length===1)return [...lines,`${ranking[0].name}さんの一局が、記録の最初の1ページに。ここからどんな物語になるでしょう？`,'成績は一局ずつ積み重なるもの。次の記録も楽しみです！'];
 const previous=standings({...state,games:orderedGames(state).slice(0,-1)}).filter(p=>p.count);
 for(let i=1;i<ranking.length-1;i++){
  const a=ranking[i],b=ranking[i+1],gap=Number((a.total-b.total).toFixed(4));
  if(gap<=10){lines.push(`${a.name}さんと${b.name}さんが接戦だ〜！${gap===0?'同点でにらみ合い':`差はわずか${gap}pt`}。この順位争い、目が離せません！`);break;}
 }
 const last=orderedGames(state).at(-1);
 for(const row of last?.rows??[]){const p=ranking.find(p=>p.id===row.playerId);if(p&&p.id!==ranking[0].id&&row.rank===1)lines.push(`${p.name}さんが直近の半荘でトップ！逆襲のスイッチ、入りましたねぇ！`);}
 const rising=ranking.slice(1).find(p=>{const old=previous.findIndex(q=>q.id===p.id);return old>=0&&old>ranking.findIndex(q=>q.id===p.id);});
 if(rising)lines.push(`${rising.name}さんが順位を上げてきた！静かに忍び寄る追い上げ、忍者なのかぁ？？`);
 const chaser=ranking[1];lines.push(`${chaser.name}さんが追いかける！次の主役を狙って、牌も作戦会議中！？`);
 const lastPlayer=ranking.at(-1)!;if(ranking.length>2)lines.push(`${lastPlayer.name}さん、ここからの巻き返しに期待！逆転ドラマは後半からが本番です！`);
 const top=ranking[0],lead=Number((top.total-chaser.total).toFixed(4));
 if(lead===0)lines.push('首位の椅子に相席中！同点のままでは終われない、次の半荘が楽しみです。');
 else if(lead<=10)lines.push(`${chaser.name}さんから首位まで${lead}pt！追う側も守る側も、気の抜けない展開です。`);
 else lines.push(`${top.name}さんが首位をキープ。追いかける皆さん、ここから見せ場を作りましょう！`);
 lines.push(`${top.name}さん、首位の景色はいかがですか？後ろからの足音にもご注目！`);
 for(const p of ranking.slice(1,-1))lines.push(`${p.name}さんにもスポットライト！上位をうかがう一局に期待が高まります。`);
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
export function liveCommentary(state:State,variant=0):string{const lines=commentaryLines(state);return lines[((variant%lines.length)+lines.length)%lines.length];}
