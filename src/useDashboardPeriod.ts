import {useState} from 'react';
/** A view preference, independent of input dates and async tournament loading. */
export function useDashboardPeriod(source:string){
 const [periods,setPeriods]=useState<Record<string,string>>({});
 const selectedDay=periods[source]??'all';
 const setSelectedDay=(day:string)=>setPeriods(previous=>({...previous,[source]:day}));
 return {selectedDay,setSelectedDay};
}
