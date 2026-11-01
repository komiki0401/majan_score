import {expect,it} from 'vitest';
import {tournamentName} from './tournament-name';
it('formats the selected calendar day and Japanese weekday without timezone shifts',()=>{
 expect(tournamentName('2026-11-01')).toBe('2026/11/01（日）麻雀会');expect(tournamentName('2026-11-02')).toBe('2026/11/02（月）麻雀会');expect(()=>tournamentName('2026-02-30')).toThrow();
});
it('adds circled suffixes only for matching names in the supplied group',()=>{
 const base=tournamentName('2026-11-01');expect(tournamentName('2026-11-01',[base])).toBe(base+'②');expect(tournamentName('2026-11-01',[base,base+'②'])).toBe(base+'③');expect(tournamentName('2026-11-02',[base,base+'②','こみき麻雀'])).toBe('2026/11/02（月）麻雀会');
});
