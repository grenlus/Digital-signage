package com.grenlus.signage.config;

import com.grenlus.signage.security.JwtAuthenticationFilter;
import com.grenlus.signage.security.ManejadorAccesoRest;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

@Configuration
public class SecurityConfig {

    private final JwtAuthenticationFilter jwtAuthenticationFilter;
    private final ManejadorAccesoRest manejadorAcceso;

    public SecurityConfig(JwtAuthenticationFilter jwtAuthenticationFilter,
                          ManejadorAccesoRest manejadorAcceso) {
        this.jwtAuthenticationFilter = jwtAuthenticationFilter;
        this.manejadorAcceso = manejadorAcceso;
    }

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        return http
                // CSRF protege formularios con sesion y cookies. Esta API es
                // stateless y se autentica por header, asi que no aplica.
                .csrf(AbstractHttpConfigurer::disable)
                .cors(Customizer.withDefaults())
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        // Login: tiene que ser publico o nadie puede entrar nunca.
                        .requestMatchers("/api/auth/**").permitAll()

                        // El player no usa JWT: un televisor no puede completar un
                        // formulario de login. Se autentica con su propio token en
                        // el header X-Pantalla-Token, que valida PlayerService.
                        // Queda fuera de la cadena de Spring Security a proposito,
                        // no sin proteccion.
                        .requestMatchers("/api/player/**").permitAll()

                        .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()

                        // El hosting lo consulta para saber si el deploy quedo
                        // sano, y no tiene con que autenticarse.
                        .requestMatchers("/api/salud").permitAll()

                        // Cuando un endpoint protegido devuelve 404 o 500, Spring
                        // reenvia a /error. Si /error tambien exige autenticacion,
                        // ese reenvio vuelve como 401 y tapa el error real.
                        .requestMatchers("/error").permitAll()

                        // Alta de clientes y de usuarios es administracion global.
                        .requestMatchers("/api/usuarios/**", "/api/clientes/**")
                        .hasRole("SUPER_ADMIN")

                        // El visualizador solo puede consultar las sucursales,
                        // pantallas y el contenido que compone sus playlists.
                        .requestMatchers(HttpMethod.GET,
                                "/api/sucursales/**",
                                "/api/pantallas/**",
                                "/api/playlist-contenidos/**",
                                "/api/contenidos/*/archivo")
                        .hasAnyRole("SUPER_ADMIN", "ADMIN_CLIENTE", "VISUALIZADOR_CLIENTE")

                        // Las demas lecturas y todas las escrituras quedan
                        // reservadas a cuentas que administran el cliente.
                        .requestMatchers("/api/**")
                        .hasAnyRole("SUPER_ADMIN", "ADMIN_CLIENTE")

                        .anyRequest().authenticated())
                .exceptionHandling(e -> e
                        .authenticationEntryPoint(manejadorAcceso)
                        .accessDeniedHandler(manejadorAcceso))
                .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class)
                .build();
    }

    /**
     * BCrypt genera un salt distinto por contrasenia y es deliberadamente lento,
     * para que probar millones de claves por segundo no sea viable.
     */
    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public AuthenticationManager authenticationManager(AuthenticationConfiguration config)
            throws Exception {
        return config.getAuthenticationManager();
    }
}
