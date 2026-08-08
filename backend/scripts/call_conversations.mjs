import { query } from '../config/database.js'
import { sign } from '../config/jwt.js'

async function main(){
  try{
    const { rows } = await query("SELECT id, full_name, email, role, business_id FROM users WHERE role = 'manager' LIMIT 1")
    if (!rows.length) {
      console.error('No manager user found')
      process.exit(1)
    }
    const u = rows[0]
    const payload = {
      id: u.id,
      name: u.full_name,
      email: u.email,
      role: u.role,
      businessId: u.business_id
    }
    const token = sign(payload)
    console.log('Using token for user:', payload)
    const res = await fetch('http://localhost:3000/api/notifications/conversations', {
      headers: { Authorization: `Bearer ${token}` }
    })
    const text = await res.text()
    console.log('Status:', res.status)
    try{ console.log('Body:', JSON.parse(text)) } catch { console.log('Body:', text) }
  }catch(e){
    console.error('Error:', e)
    process.exit(1)
  }
}

main()
