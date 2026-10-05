export function log(level, message) {
  const time = new Date().toISOString()
  console.log(`[${time}] ${level.toUpperCase()}: ${message}`)
}

export default { log }
