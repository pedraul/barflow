import { query } from '../config/database.js'

async function main(){
  try{
    const { rows } = await query('SELECT id, username, email, full_name, role, business_id FROM users')
    console.log(JSON.stringify(rows, null, 2))
  }catch(e){
    console.error('DB query failed:', e.message)
    process.exit(1)
  }
}

main()
