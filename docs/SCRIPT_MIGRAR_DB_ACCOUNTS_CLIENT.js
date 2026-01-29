// ============================================
// PASO 1: Crear el índice único en clientId
// ============================================
// Primero eliminar los registros anteriores con deuda en 0
db.CLIENT_CREDITS.deleteMany({});
db.CLIENT_ACCOUNTS.createIndex({ "clientId": 1 }, { unique: true });

print("✅ Índice creado");

// ============================================
// PASO 2: Ejecutar la migración
// ============================================
db.SALES_BILLING.aggregate([
    { $match: { saleType: "CREDITO" } },
    
    { $group: {
        _id: "$client._id",
        totalDebt: { $sum: "$totalBilling" },
        clientData: { $first: "$client" }
    }},
    
    { $project: {
        clientId: "$_id",
        client: "$clientData",
        totalDebt: 1,
        totalPaid: { $literal: 0 },
        currentBalance: "$totalDebt",
        payments: { $literal: [] },
        lastPaymentDate: { $literal: null },
        createdAt: new Date(),
        updatedAt: new Date()
    }},
    
    { $merge: {
        into: "CLIENT_ACCOUNTS",
        on: "clientId",
        whenMatched: "merge",
        whenNotMatched: "insert"
    }}
]);

print("✅ Migración completada");

// ============================================
// PASO 3: Verificar resultados
// ============================================
db.CLIENT_ACCOUNTS.find().pretty();
print("Total cuentas: " + db.CLIENT_ACCOUNTS.countDocuments());