package com.grenlus.signage.enums;

/**
 * Rol del usuario que accede al panel web.
 * SUPER_ADMIN es global (Usuario.cliente queda null); los roles de cliente
 * solo acceden a los datos de la empresa a la que pertenecen.
 */
public enum Rol {
    SUPER_ADMIN,
    ADMIN_CLIENTE,
    VISUALIZADOR_CLIENTE
}
