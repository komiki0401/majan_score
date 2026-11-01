import {standings,orderedGames,type State} from './domain';
export function liveCommentary(state:State):string{
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
