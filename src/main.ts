import { readModelFile } from "./modelio"

async function main():Promise<void> {
  await readModelFile("blah")
}
main()
  .then(()=>console.log("EXITED SAFELY"))
