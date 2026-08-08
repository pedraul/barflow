import { DataTypes } from 'sequelize'
import sequelize from './sequelize.js'

export default sequelize.define('Category', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  name: { type: DataTypes.STRING, allowNull: false },
}, { tableName: 'categories', timestamps: true, createdAt: 'created_at', updatedAt: false })
