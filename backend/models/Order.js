import { DataTypes } from 'sequelize'
import sequelize from './sequelize.js'

export default sequelize.define('Order', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  status: { type: DataTypes.ENUM('Open', 'Preparing', 'Ready', 'Served', 'Paid', 'Cancelled'), defaultValue: 'Open' },
  tableName: { type: DataTypes.STRING, field: 'table_name' },
  customerName: { type: DataTypes.STRING, field: 'customer_name' },
  userId: { type: DataTypes.UUID, field: 'user_id', allowNull: true },
  subtotal: { type: DataTypes.DECIMAL(14, 2), defaultValue: 0 },
  taxAmount: { type: DataTypes.DECIMAL(14, 2), defaultValue: 0, field: 'tax_amount' },
  totalAmount: { type: DataTypes.DECIMAL(14, 2), defaultValue: 0, field: 'total_amount' },
  completedAt: { type: DataTypes.DATE, field: 'completed_at' },
}, { tableName: 'orders', timestamps: true, createdAt: 'created_at', updatedAt: false })
