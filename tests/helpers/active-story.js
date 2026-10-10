export const activeLedger=(overrides={})=>({version:2,scene:'A locked gate by the river.',cast:['A tired guard watches the gate.'],recentEvents:['The courier reached the river.'],threads:['The route home is blocked.'],direction:'Follow the player’s present interest.',lastBeat:'The guard waits; nothing lasting changes.',...overrides});
export const cleanAudit={issues:[]};
export const activeReply=(overrides={})=>({actions:['Look at the gate.'],ledger:activeLedger(),audit:cleanAudit,...overrides});
