import { DataTypes } from 'sequelize'
import sequelize from './sequelize.js'

export default sequelize.define('OrderItem', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  quantity: { type: DataTypes.DECIMAL(14, 3), allowNull: false },
  unitPrice: { type: DataTypes.DECIMAL(14, 2), allowNull: false, field: 'unit_price' },
  lineTotal: { type: DataTypes.DECIMAL(14, 2), allowNull: false, field: 'line_total' },
}, { tableName: 'order_items', timestamps: false })
