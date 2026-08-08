import { DataTypes } from 'sequelize'
import sequelize from './sequelize.js'

export default sequelize.define('Branch', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  name: { type: DataTypes.STRING, allowNull: false },
  address: { type: DataTypes.TEXT },
  isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
}, { tableName: 'branches', timestamps: true, createdAt: 'created_at', updatedAt: false })
