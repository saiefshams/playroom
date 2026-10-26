import { createPlayroom } from './createServer'

const port = Number(process.env.PORT) || 3000
const host = process.env.HOST || '0.0.0.0'
const parlor = createPlayroom()

parlor.listen(port, host).then((bound) => {
  console.log(`Playroom listening on ${host}:${bound}`)
})
