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
 if(ranking.length<2)return lines;
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
 return [...new Set(lines)];
}
export function liveCommentary(state:State,variant=0):string{const lines=commentaryLines(state);return lines[((variant%lines.length)+lines.length)%lines.length];}
