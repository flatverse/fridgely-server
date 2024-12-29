import { Referencable } from "@flatverse/fridgely-model";

export const CURRENT_VERSION = 0

export interface SerializedFridgeState {
  version: number
  references: Referencable<string>[]
  messages:{level:"WARNING"|"ERROR", message:string, refIds?:string[]}[]
}

export class FridgeState {
  private refsById:Record<string,Referencable<string>>
  private refsByType:Record<string,Referencable<string>[]>

  constructor(
    readonly version:number,
    readonly references: Referencable<string>[],
    readonly messages:{level:"WARNING"|"ERROR", message:string, refIds?:string[]}[] = []
  ) {
    this.buildDictionaries()
  }

  private addToDictionaries(ref:Referencable<string>):void {
    const {id, type} = ref
    if (id in this.refsById) {
      const {type:existingType} = this.refsById[id]
      const isReallyBad = existingType !== type? "ERROR" : "WARNING"
      this.pushMessage(isReallyBad, `Duplicate ref ids found. types ${type}, ${existingType}`, [id])
    }
    else {
      this.refsById[id] = ref
      if (!(type in this.refsByType)) {
        this.refsByType[type] = []
      }
      this.refsByType[type].push(ref)
    }
  }

  private buildDictionaries():void {
    this.refsById = {}
    this.refsByType = {}
    for (let ref of this.references) {
      this.addToDictionaries(ref)
    }
  }

  pushMessage(level:"WARNING"|"ERROR", message:string, refIds?:string[]):void {
    this.messages.push({level,message,refIds})
  }

  pushWarning(message:string, refIds?:string[]):void {
    this.pushMessage("WARNING", message, refIds)
  }

  pushError(message:string, refIds?:string[]):void {
    this.pushMessage("ERROR", message, refIds)
  }

  getRefs<M extends Referencable<string>>(type:M["type"]):M[] {
    return type in this.refsByType? this.refsByType[type] as M[] : []
  }

  getRef<M extends Referencable<any>>(id:string):M|undefined {
    return this.refsById[id] as M|undefined
  }

  addRef<M extends Referencable<any>>(ref:M):void {
    if (ref.id in this.refsById) {
      throw Error("Can't add ref to fridge state - ID matches existing ref. " + ref.id)
    }
    this.references.push(ref)
    this.addToDictionaries(ref)
  }

  serialize():string {
    // TODO - store duplicate values in error messages so stuff doesn't get lost
    const serializable:SerializedFridgeState = {
      version: CURRENT_VERSION,
      references: Object.values(this.refsById),
      messages: this.messages
    }
    return JSON.stringify(serializable, null, 2)
  }

  static deserialize(serialized:string):FridgeState {
    let result
    try {
      result = JSON.parse(serialized) as SerializedFridgeState
    }
    catch (e) {
      const state = new FridgeState(CURRENT_VERSION, [])
      const msg = `Error parsing FridgeState string: ${e.message}\n${e.stack}`
      console.error(`[FridgeState].deserialize] ${msg}`)
      console.error(e)
      state.pushError(msg)
      state.pushError(serialized)
      return state
    }
    const {version, references, messages} = result
    if (version !== CURRENT_VERSION) {
      const state = new FridgeState(CURRENT_VERSION, [])
      const msg = `Unuspported version number in serialized FridgeState. Supported:${CURRENT_VERSION} Found:${version}`
      console.error(`[FridgeState].deserialize] ${msg}`)
      state.pushError(msg)
      state.pushError(serialized)
      return state
    }
    if (!Array.isArray(messages)) {
      const state = new FridgeState(CURRENT_VERSION, references, [])
      const msg = `deserialize passed string-object that is missing the messages array`
      console.warn(`[FridgeState].deserialize] ${msg}`)
      state.pushWarning(msg)
      state.pushWarning(serialized)
      return state
    }
    return new FridgeState(CURRENT_VERSION, references, messages)
  }
}
