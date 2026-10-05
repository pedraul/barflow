import { DataTypes } from 'sequelize'
import sequelize from './sequelize.js'

export default sequelize.define('Inventory', {
  branchId: { type: DataTypes.UUID, field: 'branch_id', primaryKey: true },
  productId: { type: DataTypes.UUID, field: 'product_id', primaryKey: true },
  quantity: { type: DataTypes.DECIMAL(14, 3), defaultValue: 0 },
  updatedAt: { type: DataTypes.DATE, field: 'updated_at' },
}, { tableName: 'branch_stock', timestamps: false })
