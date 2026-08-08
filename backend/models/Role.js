import { DataTypes } from 'sequelize'
import sequelize from './sequelize.js'

export default sequelize.define('Role', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  name: { type: DataTypes.STRING, allowNull: false },
  permissions: { type: DataTypes.JSONB, defaultValue: {} },
}, { tableName: 'roles', timestamps: true, createdAt: 'created_at', updatedAt: false })
