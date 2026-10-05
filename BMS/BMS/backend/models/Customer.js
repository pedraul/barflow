import { DataTypes } from 'sequelize'
import sequelize from './sequelize.js'

export default sequelize.define('Customer', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  name: { type: DataTypes.STRING },
  phone: { type: DataTypes.STRING },
  email: { type: DataTypes.STRING },
}, { tableName: 'customers', timestamps: true, createdAt: 'created_at', updatedAt: false })
