import { DataTypes } from 'sequelize'
import sequelize from './sequelize.js'

export default sequelize.define('Refund', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  amount: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
  reason: { type: DataTypes.TEXT },
  status: { type: DataTypes.ENUM('pending', 'approved', 'rejected'), defaultValue: 'pending' },
  approvedBy: { type: DataTypes.UUID, field: 'approved_by' },
}, { tableName: 'refunds', timestamps: true, createdAt: 'created_at', updatedAt: false })
