export const urlConfig = {
    
    //Para servidor local usar:
    
    urlServer: 'http://localhost:8080',
    
    
    //Para servidor remoto usar:
     
    //urlServer: 'https://meraki-pharma-be-6a69fc17ef2e.herokuapp.com',

    microservicioPersonaUrl: function() {
        return this.urlServer + '/api/person';
    },
    
    microservicioOrdenUrl: function() {
        return this.urlServer + '/api/order';
    },
    
    microservicioProductoUrl: function() {
        return this.urlServer + '/api/product';
    },

    microservicioClienteUrl: function() {
        return this.urlServer + '/api/client';
    },

    microservicioVentaUrl: function() {
        return this.urlServer + '/api/sale';
    },

    
    microservicioLoginUrl: function() {
        return this.urlServer + '/api/auth';
    },

    microservicioVatProductUrl: function() {
        return this.urlServer + '/api/product_vat_type';
    },

    microservicioUserUrl: function() {
        return this.urlServer + '/api/user';
    },
};