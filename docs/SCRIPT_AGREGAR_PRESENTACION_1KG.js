// Script para MongoDB Compass - Agregar presentación de 1 Kilogramo
// a productos que se venden por peso (saleType: "WEIGHT")
// 
// INSTRUCCIONES:
// 1. Abrir MongoDB Compass
// 2. Conectarse a la base de datos
// 3. Ir a la colección "products" (o el nombre de tu colección)
// 4. Abrir la pestaña "Aggregations" o usar mongosh
// 5. Ejecutar este script

// ============================================================
// OPCIÓN 1: Script para ejecutar en mongosh (MongoDB Shell)
// ============================================================

// Primero, veamos los productos que se verán afectados (dry run)
db.products.find({
    saleType: "WEIGHT",
    "presentations.isBulk": true
}).forEach(function(product) {
    print("Producto: " + product.description);
    print("Presentaciones actuales:");
    product.presentations.forEach(function(p) {
        print("  - " + p.label + " (barcode: " + p.barcode + ")");
    });
    print("---");
});

// ============================================================
// SCRIPT PRINCIPAL - Agregar presentación de 1kg
// ============================================================

db.products.find({
    saleType: "WEIGHT",
    "presentations.isBulk": true
}).forEach(function(product) {
    // Buscar la presentación de granel para obtener el precio
    var granelPresentation = product.presentations.find(function(p) {
        return p.isBulk === true;
    });
    
    if (!granelPresentation) {
        print("ADVERTENCIA: Producto " + product.description + " no tiene presentación granel");
        return;
    }
    
    // Verificar si ya existe una presentación de 1kg
    var existingKgPresentation = product.presentations.find(function(p) {
        return p.isFixedAmount === true && p.fixedAmount === 1 && p.unitMeasure === "KILOGRAMOS";
    });
    
    if (existingKgPresentation) {
        print("SALTANDO: Producto " + product.description + " ya tiene presentación de 1kg");
        return;
    }
    
    // Generar nuevo barcode basado en el existente
    // Estrategia: tomar el barcode de granel y agregar sufijo "-1KG"
    // O incrementar el último dígito si es numérico
    var baseBarcode = granelPresentation.barcode;
    var newBarcode = baseBarcode + "-1KG";
    
    // Alternativa: si prefieres un barcode numérico secuencial
    // Buscar el barcode más alto entre las presentaciones y sumar 1
    var maxBarcodeNum = 0;
    product.presentations.forEach(function(p) {
        var num = parseInt(p.barcode, 10);
        if (!isNaN(num) && num > maxBarcodeNum) {
            maxBarcodeNum = num;
        }
    });
    
    // Si todos los barcodes son numéricos, usar secuencial
    if (maxBarcodeNum > 0) {
        newBarcode = String(maxBarcodeNum + 1);
    }
    
    // Crear la nueva presentación de 1kg
    var nuevaPresentacion = {
        barcode: newBarcode,
        productCode: product.productCode,
        label: product.description + " x 1 Kilogramo",
        salePrice: granelPresentation.salePrice,  // Mismo precio que granel
        costPrice: granelPresentation.costPrice,  // Mismo costo que granel
        unitMeasure: "KILOGRAMOS",
        isBulk: false,
        isFixedAmount: true,
        fixedAmount: 1  // Descuenta 1 kg del stock
    };
    
    // Actualizar el producto agregando la nueva presentación
    db.products.updateOne(
        { _id: product._id },
        { $push: { presentations: nuevaPresentacion } }
    );
    
    print("ACTUALIZADO: " + product.description + " - Nueva presentación: " + nuevaPresentacion.label + " (barcode: " + newBarcode + ")");
});

print("\n=== SCRIPT COMPLETADO ===");


// ============================================================
// OPCIÓN 2: Usando updateMany con aggregation pipeline (MongoDB 4.2+)
// Este es más eficiente pero menos legible
// ============================================================

/*
db.products.updateMany(
    {
        saleType: "WEIGHT",
        "presentations.isBulk": true,
        // Excluir productos que ya tienen presentación de 1kg
        "presentations": {
            $not: {
                $elemMatch: {
                    isFixedAmount: true,
                    fixedAmount: 1,
                    unitMeasure: "KILOGRAMOS"
                }
            }
        }
    },
    [
        {
            $set: {
                presentations: {
                    $concatArrays: [
                        "$presentations",
                        [
                            {
                                barcode: {
                                    $concat: [
                                        {
                                            $let: {
                                                vars: {
                                                    granel: {
                                                        $arrayElemAt: [
                                                            {
                                                                $filter: {
                                                                    input: "$presentations",
                                                                    as: "p",
                                                                    cond: { $eq: ["$$p.isBulk", true] }
                                                                }
                                                            },
                                                            0
                                                        ]
                                                    }
                                                },
                                                in: "$$granel.barcode"
                                            }
                                        },
                                        "-1KG"
                                    ]
                                },
                                productCode: "$productCode",
                                label: { $concat: ["$description", " x 1 Kilogramo"] },
                                salePrice: {
                                    $let: {
                                        vars: {
                                            granel: {
                                                $arrayElemAt: [
                                                    {
                                                        $filter: {
                                                            input: "$presentations",
                                                            as: "p",
                                                            cond: { $eq: ["$$p.isBulk", true] }
                                                        }
                                                    },
                                                    0
                                                ]
                                            }
                                        },
                                        in: "$$granel.salePrice"
                                    }
                                },
                                costPrice: {
                                    $let: {
                                        vars: {
                                            granel: {
                                                $arrayElemAt: [
                                                    {
                                                        $filter: {
                                                            input: "$presentations",
                                                            as: "p",
                                                            cond: { $eq: ["$$p.isBulk", true] }
                                                        }
                                                    },
                                                    0
                                                ]
                                            }
                                        },
                                        in: "$$granel.costPrice"
                                    }
                                },
                                unitMeasure: "KILOGRAMOS",
                                isBulk: false,
                                isFixedAmount: true,
                                fixedAmount: 1
                            }
                        ]
                    ]
                }
            }
        }
    ]
);
*/


// ============================================================
// SCRIPT DE VERIFICACIÓN - Ejecutar después para confirmar
// ============================================================

/*
print("\n=== VERIFICACIÓN ===");
db.products.find({
    saleType: "WEIGHT",
    "presentations.isFixedAmount": true,
    "presentations.fixedAmount": 1
}).forEach(function(product) {
    print("Producto: " + product.description);
    var kg1 = product.presentations.find(function(p) {
        return p.isFixedAmount === true && p.fixedAmount === 1;
    });
    if (kg1) {
        print("  Presentación 1kg: " + kg1.label);
        print("  Barcode: " + kg1.barcode);
        print("  Precio: " + kg1.salePrice);
    }
    print("---");
});
*/


// ============================================================
// ROLLBACK - En caso de necesitar revertir los cambios
// ============================================================

/*
db.products.updateMany(
    {
        saleType: "WEIGHT"
    },
    {
        $pull: {
            presentations: {
                isFixedAmount: true,
                fixedAmount: 1,
                unitMeasure: "KILOGRAMOS",
                label: { $regex: /x 1 Kilogramo$/ }
            }
        }
    }
);
print("ROLLBACK COMPLETADO - Presentaciones de 1kg eliminadas");
*/
