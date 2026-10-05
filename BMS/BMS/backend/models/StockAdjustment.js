import { DataTypes } from 'sequelize'
import sequelize from './sequelize.js'

export default sequelize.define('StockAdjustment', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  movementType: { type: DataTypes.ENUM('purchase', 'sale', 'adjustment', 'waste', 'transfer'), field: 'movement_type' },
  quantityChange: { type: DataTypes.DECIMAL(14, 3), allowNull: false, field: 'quantity_change' },
  note: { type: DataTypes.TEXT },
}, { tableName: 'stock_movements', timestamps: true, createdAt: 'created_at', updatedAt: false })
