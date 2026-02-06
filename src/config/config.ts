export const urlConfig = {
    
    //For local server use:
    
    //baseUrl: 'http://localhost:8080',
    
    
    //For remote server use:
    
    baseUrl: 'https://concentrados-la-28-be-05b6b4a60f1f.herokuapp.com',

    getPersonServiceUrl: () => urlConfig.baseUrl + '/api/person',
    
    getOrderServiceUrl: () => urlConfig.baseUrl + '/api/order',
    
    getProductServiceUrl: () => urlConfig.baseUrl + '/api/product',
    
    getClientServiceUrl: () => urlConfig.baseUrl + '/api/client',
    
    getSaleServiceUrl: () => urlConfig.baseUrl + '/api/sale',
    
    getAuthServiceUrl: () => urlConfig.baseUrl + '/api/auth',
    
    getProductVatTypeServiceUrl: () => urlConfig.baseUrl + '/api/product_vat_type',
    
    getUserServiceUrl: () => urlConfig.baseUrl + '/api/user',
    
    getCatalogServiceUrl: () => urlConfig.baseUrl + '/api/catalog',
    
    getSupplierPaymentsServiceUrl: () => urlConfig.baseUrl + '/api/supplier-payments',
    
    getSupplierServiceUrl: () => urlConfig.baseUrl + '/api/suppliers',

    getExpensesServiceUrl: () => urlConfig.baseUrl + '/api/expenses',
    
    getPurchaseServiceUrl: () => urlConfig.baseUrl + '/api/purchases/invoices',
    
    getInventoryServiceUrl: () => urlConfig.baseUrl + '/api/inventory',
    
    getClientAccountsServiceUrl: () => urlConfig.baseUrl + '/api/client-accounts',
    
    getClientCreditsServiceUrl: () => urlConfig.baseUrl + '/api/client-credits',
    
    getBatchServiceUrl: () => urlConfig.baseUrl + '/api/batches',
};