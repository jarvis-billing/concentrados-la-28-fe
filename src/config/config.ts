export const urlConfig = {
    
    //For local server use:
    
    baseUrl: 'http://localhost:8080',
    
    
    //For remote server use:
    
    //baseUrl: 'https://meraki-pharma-be-6a69fc17ef2e.herokuapp.com',

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
};