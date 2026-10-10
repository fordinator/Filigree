import { clone } from '../core/campaign.js';
export const NAMESPACE='filigree';
// Old storage identifiers are read only for upgrades from the original extension.
export const LEGACY_NAMESPACE='dmbotAdventure';
const DRAFT='filigreeDraft', LEGACY_DRAFT='dmbotAdventureDraft';
const IMPORT_BACKUP='filigreeImportBackup', LEGACY_IMPORT_BACKUP='dmbotAdventureImportBackup';
const legacyPresetNames={'dmbot-ULTRA':'ultra','dmbot-frontier-scenes':'frontier','dmbot-bridge-scenes-gpt':'bridge-gpt','dmbot-bridge-scenes-fantasy-modern':'bridge-fantasy-modern','dmbot-bridge-scenes-zim':'bridge-zim','dm-bot-2-scenes-06281037p':'hybrid','dmbot-frontier-scenes.backup-pre-vtm':'frontier-pre-vtm'};
const stored=(metadata,key,oldKey)=>Object.hasOwn(metadata,key)?metadata[key]:metadata[oldKey];
export const annotatedTurn=message=>message.extra?.filigree?.turnId??message.extra?.dmbot?.turnId;
export class SillyTavernAdapter {
  constructor(context=()=>SillyTavern.getContext(),fetcher=(...args)=>fetch(...args)) {this.context=context;this.fetcher=fetcher;this.status=()=>{};this.preview=()=>{};}
  id() {
    const c=this.context();return c.chatId&&c.characters[c.characterId]?c.characters[c.characterId].avatar+':'+c.chatId:null;
  }
  assertSolo() {
    const c=this.context();
    if(c.groupId)throw new Error('Filigree supports solo character chats, not group chats');
    if(!this.id())throw new Error('Open a character chat before starting Filigree');
    return c;
  }
  currentNarratorCard() {
    const c=this.assertSolo(),avatar=c.characters[c.characterId].avatar;
    if(typeof avatar!=='string'||!avatar)throw new Error('The selected character card has no stable avatar identity');
    return {mode:'card',avatar};
  }
  async narratorCardContext(expected) {
    const origin=this.id();
    if(!expected||expected.mode!=='card'||this.currentNarratorCard().avatar!==expected.avatar)throw new Error('Dungeon Master character card changed; reopen the original card chat');
    let c=this.assertSolo();
    await c.unshallowCharacter?.(c.characterId);
    c=this.assertSolo();
    if(this.id()!==origin)throw new Error('Chat changed while loading the Dungeon Master character card');
    if(this.currentNarratorCard().avatar!==expected.avatar)throw new Error('Dungeon Master character card changed; reopen the original card chat');
    if(typeof c.getCharacterCardFields!=='function')throw new Error('This SillyTavern version cannot provide character card fields');
    const fields=c.getCharacterCardFields(),character=c.characters[c.characterId];
    return {name:character.name||c.name2||'Dungeon Master',description:String(fields.description||'').slice(0,3000),personality:String(fields.personality||'').slice(0,1500),scenario:String(fields.scenario||'').slice(0,3000)};
  }
  load() {const metadata=this.context().chatMetadata;return clone(stored(metadata,NAMESPACE,LEGACY_NAMESPACE)??null);}
  async readDiskMetadata(c) {
    const response=await this.fetcher('/api/chats/get',{method:'POST',headers:c.getRequestHeaders(),cache:'no-cache',body:JSON.stringify({avatar_url:c.characters[c.characterId].avatar,file_name:c.chatId})});
    if(!response.ok)throw new Error('Could not verify saved chat: HTTP '+response.status);
    const data=await response.json();return Array.isArray(data)?data[0]?.chat_metadata||{}:{};
  }
  async readDisk(c) {const metadata=await this.readDiskMetadata(c);return stored(metadata,NAMESPACE,LEGACY_NAMESPACE);}
  async clearAdventure() {
    const c=this.assertSolo(),id=this.id(),metadata=c.chatMetadata;
    const keys=[NAMESPACE,DRAFT,IMPORT_BACKUP,LEGACY_NAMESPACE,LEGACY_DRAFT,LEGACY_IMPORT_BACKUP];
    const previous=Object.fromEntries(keys.map(key=>[key,{had:Object.hasOwn(metadata,key),value:clone(metadata[key])}]));
    for(const key of keys)metadata[key]=null;
    try {
      await c.saveChat();
      if(this.id()!==id)throw new Error('Chat changed while clearing adventure');
      const saved=await this.readDiskMetadata(c);
      if(this.id()!==id)throw new Error('Chat changed while verifying adventure reset');
      if(keys.some(key=>saved[key]!==null))throw new Error('Adventure reset could not be verified after save. Check the server connection before retrying.');
    } catch(error) {
      if(this.id()===id)for(const key of keys) {
        if(previous[key].had)metadata[key]=previous[key].value;else delete metadata[key];
      }
      throw error;
    }
  }
  async save(state) {
    const c=this.assertSolo(),id=this.id(),previous=clone(c.chatMetadata[NAMESPACE]);
    c.chatMetadata[NAMESPACE]=clone(state);
    try {
      await c.saveChat();
      if(this.id()!==id)throw new Error('Chat changed while saving');
      const saved=await this.readDisk(c);
      if(this.id()!==id)throw new Error('Chat changed while verifying save');
      if(JSON.stringify(saved)!==JSON.stringify(state))throw new Error('Campaign save could not be verified. Check the server connection before retrying.');
    } catch(error) {
      if(this.id()===id)c.chatMetadata[NAMESPACE]=previous;
      throw error;
    }
  }
  async publish(entries) {
    const c=this.assertSolo();
    for(const entry of entries) {
      if(c.chat.some(m=>(m.extra?.filigree?.entryId??m.extra?.dmbot?.entryId)===entry.id))continue;
      const message={name:entry.role==='user'?c.name1:c.name2,is_user:entry.role==='user',is_system:false,send_date:new Date().toISOString(),
        mes:entry.content+(entry.summary?'\n\n---\n'+entry.summary:''),extra:{filigree:{entryId:entry.id,turnId:entry.turnId}}};
      c.chat.push(message);c.addOneMessage(message);
    }
    // The engine persists the outbox-clear and full transcript together next.
  }
  async backup(state) {
    if(!state)return;const c=this.assertSolo();
    c.chatMetadata[IMPORT_BACKUP]=clone(state);await c.saveChat();
  }
  settings() {
    const c=this.context();const value=c.extensionSettings[NAMESPACE]??=clone(c.extensionSettings[LEGACY_NAMESPACE]??{enabled:true,preset:'scenes'});value.preset=legacyPresetNames[value.preset]??value.preset;return value;
  }
  saveSettings() {this.context().saveSettingsDebounced();}
  async saveDraft(draft) {
    const c=this.assertSolo(),id=this.id();c.chatMetadata[DRAFT]=clone(draft);await c.saveChat();
    if(this.id()!==id)throw new Error('Chat changed while saving draft');
    const response=await this.fetcher('/api/chats/get',{method:'POST',headers:c.getRequestHeaders(),body:JSON.stringify({avatar_url:c.characters[c.characterId].avatar,file_name:c.chatId})});
    if(!response.ok)throw new Error('Draft save verification failed');
    const data=await response.json();
    if(this.id()!==id||JSON.stringify(data[0]?.chat_metadata?.[DRAFT])!==JSON.stringify(draft))throw new Error('Draft save could not be verified');
  }
  draft() {const metadata=this.context().chatMetadata;return clone(stored(metadata,DRAFT,LEGACY_DRAFT)??null);}
}
