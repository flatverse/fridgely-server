import { ModelIO, ModeFileDB } from "./modelio"

export async function setup():Promise<void> {
  const [,,,dbName="default.json"] = process.argv
  const modelio:ModelIO = new ModeFileDB({
    dbFileName:dbName
  })
  try {
    await modelio.create()
  }
  catch(e) {
    console.error(e.message)
    throw e
  }
}

export async function run() {
  const [,,,dbName="default.json"] = process.argv
  const modelio:ModelIO = new ModeFileDB({
    dbFileName:dbName
  })
  try {
    const model = await modelio.read()
    console.log(model)
    // model.pushMessage("WARNING", "TESTING1")
    await modelio.write(model)
  }
  catch(e) {
    console.error(e.message)
    throw e
  }
}

const [,,runArg] = process.argv
if (runArg === "run") {
  run()
    .then(()=>console.log("EXITED SAFELY"))
}
else if (runArg === "setup") {
  setup()
    .then(()=>console.log("EXITED SAFELY"))
}
