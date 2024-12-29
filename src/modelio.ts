import { CURRENT_VERSION, FridgeState } from "./FridgeState"
import { readFile, access, rename, writeFile, mkdir, copyFile } from "fs/promises"
import path from "path"

/**
 * @module modelio module for reading and writing Fridgely Models.
 * 
 * TODO: Cloud storage AKA ModelCloudDB (and then, later, dealing with conflicts)
 */

/**
 * @class ModelIO
 * ABSTRACT BASE CLASS
 */
export abstract class ModelIO {
  /**
   * @prop used for debug printouts to distinguish between other instances of this class
   */
  readonly debugId: string = ModeFileDB.generateDebugId(3)
  readonly options:Required<ModelDBOptions>

  constructor(options:ModelDBOptions) {
    this.options = {...MODEL_DB_DEFAULTS, ...options}
  }

  abstract create():Promise<FridgeState>
  abstract write(model:FridgeState):Promise<void>
  abstract read():Promise<FridgeState>
}

/**
 * @interface ModelDBRequiredOptions
 * the options that must be included when instantiating an ModelIO instance
 */
export interface ModelDBRequiredOptions {
  dbFileName: string
}

/**
 * @constant MODEL_DB_DEFAULTS
 */
export const MODEL_DB_DEFAULTS = {
  localBackupCount: 3,
  baseFolder: "./localdb/default",
  backupsFolderName: "backups",
  // writeLogFileName: "writelog.txt"
}

/**
 * @type {ModelDBOptions} Options that can be passed into a new ModelIO instance constructor
 */
export type ModelDBOptions = Partial<typeof MODEL_DB_DEFAULTS> & ModelDBRequiredOptions

/**
 * =============================================================================
 * Handles reading, writing, version and backups management for locally saved FridgeState files
 * @class ModelFileDB
 * TODO: Exception handling / custom exceptions
 * =============================================================================
 */
export class ModeFileDB extends ModelIO {

  /* ---------------------------------------------------------------------------
  || static util functions
  ---------------------------------------------------------------------------- */

  /**
   * Check if a file exists
   * *LLM created*
   * @param filePath path to file to check
   * @returns promise with bool indicating if file exists
   */
  static async fileExists(filePath: string):Promise<boolean> {
    try {
      await access(filePath);
      return true // File exists
    } catch (error) {
      if (error.code === 'ENOENT') {
        return false // File does not exist
      }
      throw error // Other errors
    }
  }

  /**
   * read a file to string (assuming utf-8) return null if it doesn't exist
   * @param filePath 
   * @returns 
   */
  static async readFile(filePath:string):Promise<string|null> {
    const exists = await ModeFileDB.fileExists(filePath)
    return exists? readFile(filePath, "utf-8") : null
  }

  /**
   * read a file and serialize into a FridgeState model instance.
   * return null if it does't exist
   * @param filePath 
   * @returns 
   */
  static async readModelFile(filePath:string):Promise<FridgeState|null> {
    const contents = await ModeFileDB.readFile(filePath)
    if (contents !== null) {
      return FridgeState.deserialize(contents)
    }
    else {
      return null
    }
  }

  static generateDebugId(length:number): string {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    let result = ""
    for (let i = 0; i < length; i++) {
      const index = Math.floor(Math.random()*alphabet.length)
      result += alphabet[index]
    }
    return result
  }

  /* ---------------------------------------------------------------------------
  || instance methods
  --------------------------------------------------------------------------- */

  getModelFilePath():string {
    return path.resolve(this.options.baseFolder, this.options.dbFileName)
  }

  getModelFileNameParts():{base:string, ext:string} {
    const periodIndex = this.options.dbFileName.lastIndexOf(".")
    if (periodIndex === -1) {
      throw new Error("BAD BACKUP FILE NAME "+this.options.dbFileName)
    }
    const base = this.options.dbFileName.substring(0,periodIndex)
    const ext = this.options.dbFileName.substring(periodIndex)
    return {base,ext}
  }

  getModelBackupFilePath(backupIndex?:number):string {
    let dbFileName:string
    if (backupIndex !== undefined) {
      const {base,ext} = this.getModelFileNameParts()
      dbFileName = `${base}_${backupIndex}${ext}`
    }
    else {
      dbFileName = this.options.dbFileName
    }
    return path.resolve(this.options.baseFolder, this.options.backupsFolderName, dbFileName)
  }

  private async readModelFiles():Promise<{model: FridgeState|null, backup: FridgeState|null}> {
    const backup = await ModeFileDB.readModelFile(this.getModelBackupFilePath())
    const model = await ModeFileDB.readModelFile(this.getModelFilePath())
    // TODO: check model against backup - should be the same
    return {
      model,
      backup
    }
  }

  /**
   * move/rename all the backup files to one index greater
   * 
   * - will delete (via overwrite) the oldest backup up
   * - expects backups/mydb.json to be the latest version of the main mydb.json file
   * 
   * i.e. if this.options.localBackupCount is 4, this method will
   *   1. rename the backups/mydb_2.json to backups/mydb_3.json (existing mydb_3.json file will be overwritten)
   *   2. rename the backups/mydb_1.json to backups/mydb_2.json (existing mydb_2.json was renamed in previous step)
   *   3. rename the backups/mydb_0.json to backups/mydb_1.json (existing mydb_1.json was renamed in previous step)
   *   4. reanme the backups/mydb.json to backups/mydb_0.json (copies the newest backup file to mydb_0.json, existing mydb_0.json was renamed in previous step)
   * @param contents 
   */
  private async shiftBackupFiles():Promise<void> {
    const baseBackupFilePath = this.getModelBackupFilePath()
    if (!await ModeFileDB.fileExists(baseBackupFilePath)) {
      throw new Error("Can't shift backups because base backup doesn't exist! "+baseBackupFilePath)
    }
    for (let i = this.options.localBackupCount-1; i > 0;i--) {
      const newerFilePath = this.getModelBackupFilePath(i-1)
      const olderFilePath = this.getModelBackupFilePath(i)
      if (await ModeFileDB.fileExists(newerFilePath)) {
        await rename(newerFilePath, olderFilePath)
      }
      // else that backup presumably hasn't been created yet
    }
    if (this.options.localBackupCount > 0) {
      await copyFile(baseBackupFilePath, this.getModelBackupFilePath(0))
    }
  }

  /* ---------------------------------------------------------------------------
   * ModelIO implementation
   * ------------------------------------------------------------------------ */

  /**
   * creates a new FridgeState instance and writes it, along with a backup, to file
   */
  async create():Promise<FridgeState> {
    const dbPath = this.getModelFilePath()
    if (await ModeFileDB.fileExists(dbPath)) {
      throw new Error(`CANT CREATE DB at ${dbPath}! ALREADY EXISTS`)
    }
    const backupPath = this.getModelBackupFilePath()
    await mkdir(path.dirname(backupPath), {recursive:true})
    const newModel = new FridgeState(CURRENT_VERSION, [])
    const content = newModel.serialize()
    await writeFile(backupPath, content, "utf-8")
    await this.shiftBackupFiles()
    await writeFile(dbPath, content, "utf-8")
    return newModel
  }

  /**
   * 
   * @param model 
   */
  async write(model:FridgeState):Promise<void/* TODO metadata i.e. backup failed to write, but main did*/> {
    const baseBackupFilePath = this.getModelBackupFilePath()
    if (!await ModeFileDB.fileExists(baseBackupFilePath)) {
      throw new Error("Can't perform backup because previous base backup doesn't exist! "+baseBackupFilePath)
    }
    const content = model.serialize()
    await writeFile(baseBackupFilePath, content, "utf-8")
    await this.shiftBackupFiles()
    await writeFile(this.getModelFilePath(), content, "utf-8")
  }

  /**
   * 
   * @returns 
   */
  async read(): Promise<FridgeState> {
    const {model} = await this.readModelFiles()
    // TODO maybe check if matches backup?
    if (model === null) {
      throw new Error("MODEL NOT FOUND AT "+this.getModelFilePath())
    }
    return model
  }
}
