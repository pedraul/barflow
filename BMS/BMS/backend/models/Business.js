import { DataTypes } from 'sequelize'
import sequelize from './sequelize.js'

export default sequelize.define('Business', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  name: { type: DataTypes.STRING, allowNull: false },
  currencyCode: { type: DataTypes.CHAR(3), defaultValue: 'RWF' },
  address: { type: DataTypes.STRING, allowNull: true },
  city: { type: DataTypes.STRING, allowNull: true },
  country: { type: DataTypes.STRING, defaultValue: 'Rwanda' },
  contactPhone: { type: DataTypes.STRING, allowNull: true },
  contactEmail: { type: DataTypes.STRING, allowNull: true },
  businessType: { type: DataTypes.STRING, allowNull: true },
  registrationCode: { type: DataTypes.STRING, allowNull: true },
  taxId: { type: DataTypes.STRING, allowNull: true },
}, { tableName: 'businesses', timestamps: true, createdAt: 'created_at', updatedAt: false })
