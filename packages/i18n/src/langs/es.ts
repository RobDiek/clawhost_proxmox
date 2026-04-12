import type { Translations } from '#i18n/types'

const es: Translations = {
    common: {
        loading: 'Cargando...',
        noResults: 'No se encontraron resultados.',
        save: 'Guardar',
        cancel: 'Cancelar',
        confirm: 'Confirmar',
        delete: 'Eliminar',
        deleting: 'Eliminando...',
        back: 'Volver',
        create: 'Crear',
        done: 'Listo',
        copy: 'Copiar',
        copied: 'Copiado.',
        copiedWithLabel: '{{label}} copiado.',
        show: 'Mostrar',
        hide: 'Ocultar',
        tryAgain: 'Intentar de nuevo',
        addKey: 'Agregar clave',
        close: 'Cerrar',
        none: 'Ninguno',
        all: 'Todos',
        unknown: 'Desconocido',
        pageNotFound: 'Página no encontrada',
        closeNotification: 'Cerrar notificación',
        beta: 'Beta',
        brandName: 'ClawHost',
        brandNameGo: 'ClawHost Go',
        brandNameGoVersion: 'ClawHost Go {{version}}',
        pageTitleWithBrand: '{{title}} - ClawHost',
        menuFile: 'Archivo',
        menuEdit: 'Editar',
        menuView: 'Visualización',
        menuWindow: 'Ventana',
        menuHelp: 'Ayuda',
        supportEmail: 'support@clawhost.cloud',
        scrollToBottom: 'Ir al final',
        second: 'segundo',
        seconds: 'segundos'
    },
    setup: {
        welcomeTitle: 'Bienvenido a ClawHost Go',
        welcomeDescription: 'Configura tu perfil para comenzar.',
        whatsYourName: '¿Cómo te llamas?',
        namePlaceholder: 'Ingresa tu nombre',
        nameHint: 'Siempre puedes configurarlo más tarde.',
        getStarted: 'Comenzar'
    },
    language: {
        en: 'English',
        fr: 'Français',
        es: 'Español',
        de: 'Deutsch',
        zh: '中文',
        hi: 'हिन्दी',
        ar: 'العربية',
        ru: 'Русский',
        ja: '日本語',
        tr: 'Türkçe',
        it: 'Italiano',
        pl: 'Polski',
        nl: 'Nederlands',
        pt: 'Português',
        switchLanguage: 'Idioma'
    },
    theme: {
        light: 'Claro',
        dark: 'Oscuro',
        system: 'Sistema',
        toggleTheme: 'Cambiar tema'
    },
    nav: {
        claws: 'Claws',
        sshKeys: 'Claves SSH',
        account: 'Cuenta',
        billing: 'Facturación',
        affiliate: 'Afiliado',
        license: 'Licencia',
        signOut: 'Cerrar sesión',
        admin: 'Admin',
        login: 'Iniciar sesión',
        deploy: 'Desplegar',
        deployOpenClaw: 'Desplegar OpenClaw',
        mainNavigation: 'Navegacion principal',
        footerNavigation: 'Navegacion del pie de pagina',
        toggleMenu: 'Alternar menu',
        cloud: 'Cloud',
        cloudSubtitle: 'Técnico',
        go: 'Go',
        goSubtitle: 'No técnico'
    },
    go: {
        pageTitle: 'ClawHost Go',
        heroTitle1: 'Despliega OpenClaw.',
        heroTitle2: 'Localmente. Al instante.',
        badge: 'Próximamente',
        comingSoon: 'Próximamente',
        description:
            'Un cliente de escritorio ligero para gestionar tus instancias de OpenClaw. Despliega, monitorea y controla tus claws — directamente desde tu máquina.',
        download: 'Descargar para {{os}}',
        downloadWindows: 'Windows',
        downloadMac: 'macOS',
        selfHostInstead: 'Auto-alojar en su lugar',
        features: 'Características',
        whyClawHostGo: 'Todas las funciones',
        featuresDescription:
            'Por qué vale la pena probarnos, las características no mienten.',
        zeroConfigDescription:
            'Instala y ejecuta. Sin configuración de servidor ni nube. OpenClaw está listo en segundos.',
        ownedDataDescription:
            'Todo se ejecuta en tu dispositivo. Sin servidores en la nube, sin terceros, sin datos saliendo de tu máquina.',
        terminalAccessDescription:
            'Accede al terminal de tu instancia OpenClaw directamente desde la aplicación. Sin clientes SSH externos.',
        simplePricing: 'Precios simples',
        simplePricingDescription:
            'Una licencia, todo ilimitado. Sin facturas mensuales, sin límites de uso, sin cargos ocultos.',
        localDomain: 'Dominio local personalizado',
        localDomainDescription:
            'Accede a tu OpenClaw a través de un dominio local personalizado. URLs limpias en tu propia red.',
        secureDescription:
            'Tus datos nunca salen de tu dispositivo. Completamente aislado, completamente cifrado, completamente tuyo.',
        pricing: 'Precios',
        pricingTitle: 'Precio único y simple',
        pricingDescription:
            'Sin suscripciones, sin tarifas ocultas. Una licencia, uso ilimitado.',
        pricingPrice: '${{price}}',
        pricingLabel: 'Pago único',
        pricingFeature1: 'Licencia de por vida',
        pricingFeature2: 'Claws ilimitados',
        pricingFeature3: 'Todas las actualizaciones futuras',
        pricingFeature4: 'Sin límites de uso',
        pricingFeature5: 'Soporte prioritario',
        pricingFeature6: 'Dominio local personalizado',
        pricingCta: 'Obtener ClawHost Go',
        comparison: 'Comparación',
        comparisonTitle: 'Go vs Cloud',
        comparisonDescription:
            'Elige lo que te funcione. Go se ejecuta localmente, Cloud en servidores dedicados.',
        comparisonLocalUs: 'Se ejecuta completamente en tu dispositivo',
        comparisonLocalOthers: 'Se ejecuta en servidores remotos',
        comparisonPricingUs: 'Pago único',
        comparisonPricingOthers: 'Suscripción mensual',
        comparisonDataUs: 'Los datos se quedan en tu máquina',
        comparisonDataOthers: 'Datos en servidores en la nube',
        comparisonSetupUs: 'Instalar y ejecutar al instante',
        comparisonSetupOthers: 'Desplegar en un clic',
        comparisonUpdatesUs: 'Actualizaciones automáticas',
        comparisonUpdatesOthers: 'Actualizaciones automáticas',
        faqTitle: 'Preguntas',
        faqHeading: 'Preguntas frecuentes',
        faqDescription: 'Todo lo que necesitas saber sobre ClawHost Go.',
        faq1Question: '¿Qué es ClawHost Go?',
        faq1Answer:
            'ClawHost Go es una aplicación de escritorio ligera que te permite ejecutar OpenClaw localmente en tu máquina. Sin servidores en la nube — instala, ejecuta y comienza a usar OpenClaw en segundos.',
        faq2Question: '¿En qué se diferencia Go de ClawHost Cloud?',
        faq2Answer:
            'ClawHost Cloud despliega OpenClaw en servidores remotos dedicados con disponibilidad 24/7 y acceso global. ClawHost Go ejecuta todo localmente en tu dispositivo — ideal para privacidad, uso sin conexión y configuraciones simples.',
        faq3Question: '¿Necesito conexión a internet?',
        faq3Answer:
            'ClawHost Go funciona sin conexión para uso local. Solo se necesita conexión a internet para la configuración inicial, actualizaciones y funciones que requieran llamadas API externas.',
        faq4Question: '¿La licencia es un pago único?',
        faq4Answer:
            'Sí. Pagas una vez y obtienes acceso de por vida a ClawHost Go, incluyendo todas las actualizaciones futuras. Sin suscripciones, sin cargos recurrentes.',
        faq5Question: '¿Qué sistemas operativos son compatibles?',
        faq5Answer:
            'ClawHost Go es compatible con Windows y macOS. Ambas plataformas tienen las mismas funciones y reciben actualizaciones simultáneamente.',
        faq6Question: '¿Puedo cambiar de Go a Cloud después?',
        faq6Answer:
            'Por supuesto. Puedes exportar tu configuración de OpenClaw desde Go y desplegarla en ClawHost Cloud en cualquier momento. Ambas plataformas son completamente compatibles.',
        statsPrice: '${{price}}',
        statsLifetime: 'De por vida',
        statsOneTime: 'Único',
        statsPayment: 'Pago',
        statsLocal: 'Local',
        statsLocally: 'Se ejecuta localmente',
        statsZero: 'Cero',
        statsZeroConfig: 'Cero configuración',
        ctaTitle: 'Ejecuta OpenClaw localmente',
        ctaDescription:
            'Pago único, licencia de por vida. Despliega OpenClaw en tu propia máquina — sin cloud, sin suscripciones, sin límites. Tus datos, tus reglas.',
        ctaButton: 'Obtener ClawHost Go',
        joinWaitlist: 'Unirse a la lista de espera',
        joinedWaitlist: 'En la lista de espera',
        waitlistJoinedToast: 'Te has unido a la lista de espera.',
        waitlistAlreadyJoinedToast: 'Este email ya está en la lista.',
        waitlistFailedToast: '¡Error al unirse a la lista de espera!',
        waitlistEmailPlaceholder: 'Ingresa tu email',
        updateAvailable: 'La versión {{version}} está disponible.',
        updateDownload: 'Descargar',
        updateDismiss: 'Más tarde',
        clawNotFound: '¡Claw no encontrado!',
        invalidClawName:
            '¡Nombre de claw inválido. Usa solo letras, números y guiones!',
        clawNameAlreadyExists: '¡Ya existe un claw con este nombre!',
        invalidSubdomain:
            '¡Subdominio inválido. Usa de 3 a 20 letras minúsculas y números!',
        subdomainAlreadyInUse: '¡Este subdominio ya está en uso!',
        clawDirectoryNotFound: '¡Directorio del claw no encontrado!',
        noVersionInstalled:
            '¡No hay ninguna versión de OpenClaw instalada. Ve a la pestaña Versiones e instala una primero!',
        failedToStartClaw: '¡Error al iniciar el claw!',
        noVersionAssigned:
            '¡No hay ninguna versión de OpenClaw asignada a este claw!',
        invalidAgentName: '¡Nombre de agente inválido!',
        invalidPath: '¡Ruta inválida!',
        fileNotFound: '¡Archivo no encontrado!',
        purchasingNotAvailable: '¡La compra no está disponible en modo local!',
        exportFailed: '¡Error al exportar!',
        versionNotInstalled:
            '¡La versión {{version}} de OpenClaw no está instalada!',
        failedToStartProcess: '¡Error al iniciar el proceso: {{reason}}!',
        processExitedImmediately:
            'El proceso terminó inmediatamente. Logs:\n{{logs}}',
        processExitedImmediatelyNoLogs:
            '¡El proceso terminó inmediatamente después de iniciar!',
        processExitedWithCode:
            'El proceso terminó con el código {{code}}. Logs:\n{{logs}}',
        processExitedWithCodeNoLogs:
            '¡El proceso terminó con el código {{code}}!',
        processExitedUnexpectedly: '¡El proceso terminó inesperadamente!',
        failedToInstallVersion:
            '¡Error al instalar OpenClaw {{version}}: {{reason}}!',
        oauthCancelled: '¡Autenticación cancelada!',
        diskFull: '¡No queda espacio en el dispositivo!',
        permissionDenied: '¡Permiso denegado!',
        networkTimeout: '¡La solicitud de red ha expirado!'
    },
    footer: {
        website: 'Sitio web',
        copyrightName: 'ClawHost',
        copyrightRights: 'Todos los derechos reservados.',
        termsOfService: 'Términos de servicio',
        privacyPolicy: 'Política de privacidad',
        getInTouch: 'Contáctanos',
        brandDescription:
            'Despliega OpenClaw en tu propio VPS con un solo clic. Privacidad total, recursos dedicados, sin infraestructura compartida.',
        builtBy: 'Creado por',
        supportedBy: 'Apoyado por',
        product: 'Producto',
        howItWorks: 'Proceso',
        features: 'Funciones',
        pricing: 'Precios',
        faq: 'Preguntas',
        blog: 'Blog',
        changelog: 'Historial de cambios',
        compare: 'Comparación completa',
        legalAndMore: 'Otros',
        affiliateProgram: 'Programa de afiliados',
        documentation: 'Documentación',
        productDescription:
            'Despliega agentes OpenClaw en la nube o en local con un clic — crea, conecta y escala tus agentes de IA más rápido con ClawHost.',
        downloadAndroid: 'Disponible en Google Play',
        downloadIos: 'Descargar en el App Store',
        ariaGithub: 'GitHub',
        ariaX: 'X',
        ariaFacebook: 'Facebook',
        ariaInstagram: 'Instagram',
        ariaThreads: 'Threads',
        ariaYoutube: 'YouTube',
        ariaTiktok: 'TikTok'
    },
    errors: {
        somethingWentWrong: '¡Algo salió mal!',
        couldNotLoadData:
            'No pudimos cargar los datos. Por favor, intenta de nuevo!',
        notFound: 'Página no encontrada!',
        pageNotFoundDescription:
            'La página que buscas no existe o ha sido movida.',
        goToHomepage: 'Ir al inicio',
        failedToLoadAgents: 'Error al cargar los agents!',
        failedToLoadAgentsDescription:
            'No pudimos cargar tus Agents. Por favor, verifica tu conexión e intenta de nuevo.',
        failedToLoadSSHKeys: 'Error al cargar las claves SSH!',
        failedToLoadSSHKeysDescription:
            'No pudimos cargar tus claves SSH. Por favor, verifica tu conexión e intenta de nuevo.',
        failedToUpdateProfile: 'Error al actualizar el perfil!',
        failedToAddSSHKey: 'Error al agregar la clave SSH!',
        failedToCreateClaw: 'Error al crear el claw!',
        failedToLoadLocations:
            'Error al cargar las ubicaciones. Por favor, intenta de nuevo!',
        failedToLoadPlans:
            'Error al cargar los planes. Por favor, intenta de nuevo!',
        invalidPlan: 'Plan seleccionado no válido!',
        invalidLocation: 'Por favor, selecciona una ubicación!',
        failedToGenerateKeyPair:
            'Error al generar el par de claves. Por favor, genera las claves localmente!',
        unableToLoadPricing:
            'No se pudieron cargar los precios. Por favor, intenta más tarde!',
        noPasswordAvailable: 'No hay contraseña disponible para este claw!',
        clawLimitReached:
            'Has alcanzado el límite de {{max}} claws. Por favor, contacta a soporte para aumentar este límite!',
        sshKeyLimitReached:
            'Has alcanzado el límite de {{max}} claves SSH. Por favor, contacta a soporte para aumentar este límite!'
    },
    api: {
        missingRequiredFields: 'Faltan campos obligatorios!',
        clawNotFound: 'Claw no encontrado!',
        clawRenamed: 'Claw renombrado con éxito.',
        invalidClawName:
            'El nombre del claw debe tener entre 1 y {{max}} caracteres!',
        userNotFound: 'Usuario no encontrado!',
        sshKeyNotFound: 'Clave SSH no encontrada!',
        pendingClawNotFound: 'Claw pendiente no encontrado!',
        clawNotScheduledForDeletion:
            'El claw no está programado para eliminación!',
        clawDeletionAlreadyPassed: 'La fecha de eliminación ya ha pasado!',
        clawLimitReached:
            'Has alcanzado el límite de {{max}} claws. Por favor, contacta a soporte para aumentar este límite!',
        sshKeyLimitReached:
            'Has alcanzado el límite de {{max}} claves SSH. Por favor, contacta a soporte para aumentar este límite!',
        volumeSizeInvalid:
            'El tamaño del volumen debe ser entre {{min}} y {{max}} GB!',
        paymentNotConfigured: 'El pago no está configurado para este plan!',
        invalidSshKeyFormat: 'Formato de clave pública SSH no válido!',
        sshKeyInUse:
            'Esta clave SSH está siendo utilizada por uno o más claws!',
        inputTooLong: 'La entrada excede la longitud máxima permitida!',
        invalidEmailFormat: 'Formato de correo electrónico no válido!',
        plusAddressingNotAllowed:
            'No se permite el uso del signo + en el correo electrónico para iniciar sesión!',
        invalidRedirectUrl: 'URL de redirección no válida!',
        fileTooLarge:
            'El contenido del archivo excede el tamaño máximo permitido!',
        nameAndKeyRequired: 'El nombre y la clave pública son obligatorios!',
        nameTooLong: 'El nombre debe tener {{max}} caracteres o menos!',
        noBillingAccount: 'No se encontró cuenta de facturación!',
        orderIdRequired: 'El ID de orden es obligatorio!',
        orderNotFound: 'Orden no encontrada!',
        emailRequired: 'El correo electrónico es obligatorio!',
        redirectUrlRequired: 'La URL de redirección es obligatoria!',
        invalidWebhook: 'Webhook no válido!',
        failedToStartClaw: 'Error al iniciar el claw!',
        failedToStopClaw: 'Error al detener el claw!',
        failedToRestartClaw: 'Error al reiniciar el claw!',
        failedToDeleteClaw: 'Error al eliminar el claw!',
        failedToCreateClaw: 'Error al crear el claw!',
        invalidProvider: 'Proveedor no válido!',
        providerNotAllowed: 'Este proveedor no está disponible actualmente!',
        invalidPlan: 'Plan seleccionado no válido!',
        planBelowMinimumMemory:
            'Este plan no cumple con el requisito mínimo de memoria!',
        invalidLocation: 'Ubicación seleccionada no válida!',
        planNotAvailableAtLocation:
            'Este plan no está disponible en la ubicación seleccionada!',
        failedToSyncClaw: 'Error al sincronizar el estado del servidor!',
        failedToProvisionClaw: 'Error al aprovisionar el claw!',
        failedToInitiatePurchase: 'Error al iniciar la compra!',
        failedToCancelDeletion: 'Error al cancelar la eliminación!',
        failedToHardDeleteClaw: 'Error al eliminar el claw permanentemente!',
        failedToCancelScheduledDeletion:
            'Error al cancelar la eliminación programada!',
        failedToCreateSshKey: 'Error al crear la clave SSH!',
        failedToDeleteSshKey: 'Error al eliminar la clave SSH!',
        failedToUpdateProfile: 'Error al actualizar el perfil!',
        failedToGetProfile: 'Error al obtener el perfil!',
        failedToGetInvoice: 'Error al obtener la factura!',
        failedToGetCustomerPortal: 'Error al obtener el portal del cliente!',
        failedToGetBillingHistory:
            'Error al obtener el historial de facturación!',
        failedToGetStats: 'Error al obtener las estadísticas!',
        affiliateFetched: 'Información de afiliado obtenida correctamente.',
        failedToGetAffiliate: 'Error al obtener la información de afiliado!',
        invalidPeriod: '¡Filtro de período no válido!',
        referralCodeUpdated: 'Código de referido actualizado correctamente.',
        failedToUpdateReferralCode:
            'Error al actualizar el código de referido!',
        invalidReferralCodeLength:
            'El código de referido debe tener entre {{min}} y {{max}} caracteres!',
        invalidReferralCodeFormat:
            'El código de referido solo puede contener letras, números, guiones y guiones bajos!',
        referralCodeAlreadyChanged:
            'El código de referido solo se puede cambiar una vez!',
        referralCodeTaken: 'Este código de referido ya está en uso!',
        referralCodeGenerated: 'Código de referido generado.',
        failedToGenerateReferralCode: 'Error al generar el código de referido!',
        failedToFetchLocations: 'Error al obtener las ubicaciones!',
        failedToFetchPlans: 'Error al obtener los planes!',
        failedToFetchVolumePricing: 'Error al obtener los precios de volumen!',
        failedToFetchPlanAvailability:
            'Error al obtener la disponibilidad del plan!',
        failedToSendEmail: 'Error al enviar el correo electrónico!',
        failedToGetVersion: 'Error al obtener la versión!',
        failedToGetVersions: 'Error al obtener las versiones!',
        failedToInstallVersion: 'Error al instalar la versión!',
        installVersionSuccess: 'Versión instalada con éxito.',
        invalidVersion: 'Formato de versión inválido!',
        outdatedVersion: 'Esta versión es obsoleta y no se puede instalar!',
        failedToGetDiagnostics: 'Error al conectar con la instancia!',
        failedToGetDiagnosticsDescription:
            'No se pudieron obtener los diagnósticos. La instancia puede estar fuera de línea o iniciando.',
        failedToGetLogs: 'Error al cargar los registros!',
        failedToGetLogsDescription:
            'No se pudieron obtener los registros de esta instancia. Por favor, intenta más tarde.',
        failedToReinstallClaw: 'Error al reinstalar la instancia!',
        reinstallSuccess: 'Instancia reinstalada exitosamente.',
        reinstallRateLimited:
            'Solo puedes reinstalar una vez cada 24 horas. Contacta al equipo si deseas eliminar este límite.',
        subdomainRateLimited:
            'Solo puedes cambiar tu subdominio una vez cada 24 horas. Contacta al equipo si deseas eliminar este límite.',
        subdomainUpdated: 'Subdominio actualizado exitosamente.',
        invalidSubdomain:
            '¡Subdominio inválido. Usa de 3 a 20 letras minúsculas y números!',
        subdomainAlreadyInUse: '¡Este subdominio ya está en uso!',
        clawBusy: 'El claw está siendo aprovisionado o eliminado!',
        reinstallGatewayNotResponding:
            'Reinstalación completada pero el gateway aún no responde. Puede necesitar más tiempo para iniciar!',
        failedToRepairClaw: 'Failed to repair the instance!',
        repairSuccess: 'Instance repaired successfully.',
        repairGatewayNotResponding:
            'Repair applied but gateway is not responding yet. It may need more time to start.',
        failedToExportClaw: 'Error al exportar los datos del claw!',
        clawNotReady: 'El claw no está listo para exportar!',
        exportRateLimited:
            'Este claw fue exportado recientemente. Por favor, espera antes de exportar de nuevo!',
        failedToListFiles: 'Error al listar los archivos de la instancia!',
        failedToReadFile: 'Error al leer el archivo!',
        failedToUpdateFile: 'Error al guardar el archivo!',
        invalidFilePath: 'Ruta de archivo no válida!',
        fileNotEditable: 'Este tipo de archivo no se puede editar!',
        invalidJsonConfig: 'JSON no válido!',
        fileSaveSuccess: 'Archivo guardado.',
        rateLimitExceeded: 'Por favor, espera antes de solicitar otro código!',
        otpExpiredOrNotFound:
            'Código expirado o no encontrado. Por favor, solicita uno nuevo!',
        otpMaxAttemptsReached:
            'Demasiados intentos fallidos. Por favor, solicita un nuevo código!',
        otpInvalidCode: 'Código no válido. Por favor, intenta de nuevo!',
        licenseAlreadyPurchased: 'Licencia ya comprada!',
        licenseNotAvailable: 'El producto de licencia no está disponible!',
        licenseCheckoutCreated: 'Pago de licencia creado.',
        failedToPurchaseLicense: 'Error al crear el pago de licencia!',
        internalServerError: 'Ocurrió un error interno!',
        invalidCredentials: 'Credenciales no válidas!',
        accountLinked: 'Cuenta vinculada correctamente.',
        webhookProcessingFailed: 'Error al procesar el webhook!',
        adminAccessDenied: 'Se requiere acceso de administrador!',
        clawsFetched: 'Claws obtenidos exitosamente.',
        clawFetched: 'Claw obtenido exitosamente.',
        clawSynced: 'Claw sincronizado exitosamente.',
        clawStarted: 'Claw iniciado exitosamente.',
        clawStopped: 'Claw detenido exitosamente.',
        clawRestarted: 'Claw reiniciado exitosamente.',
        clawCreated: 'Claw creado exitosamente.',
        clawDeleted: 'Claw eliminado exitosamente.',
        clawDeletionScheduled: 'Eliminación del claw programada.',
        clawDeletionCancelled: 'Eliminación del claw cancelada.',
        clawHardDeleted: 'Claw eliminado permanentemente.',
        pendingClawCancelled: 'Compra cancelada.',
        failedToCancelPendingClaw: 'Error al cancelar la compra!',
        clawPurchaseInitiated: 'Compra iniciada exitosamente.',
        sshKeysFetched: 'Claves SSH obtenidas exitosamente.',
        sshKeyCreated: 'Clave SSH creada exitosamente.',
        sshKeyDeleted: 'Clave SSH eliminada exitosamente.',
        profileFetched: 'Perfil obtenido exitosamente.',
        profileUpdated: 'Perfil actualizado exitosamente.',
        statsFetched: 'Estadísticas obtenidas exitosamente.',
        billingHistoryFetched:
            'Historial de facturación obtenido exitosamente.',
        invoiceFetched: 'Factura obtenida exitosamente.',
        customerPortalFetched:
            'URL del portal del cliente obtenida exitosamente.',
        plansFetched: 'Planes obtenidos exitosamente.',
        locationsFetched: 'Ubicaciones obtenidas exitosamente.',
        volumePricingFetched: 'Precios de volumen obtenidos exitosamente.',
        planAvailabilityFetched:
            'Disponibilidad del plan obtenida exitosamente.',
        diagnosticsFetched: 'Diagnósticos obtenidos exitosamente.',
        metricsFetched: 'Métricas obtenidas exitosamente.',
        failedToGetMetrics: 'Error al obtener las métricas del servidor!',
        enablePreviewSuccess: 'Modo de vista previa activado exitosamente.',
        failedToEnablePreview: 'Error al activar el modo de vista previa!',
        logsFetched: 'Registros obtenidos exitosamente.',
        filesFetched: 'Archivos obtenidos exitosamente.',
        fileFetched: 'Archivo obtenido exitosamente.',
        otpSent: 'Código enviado exitosamente.',
        otpVerified: 'Código verificado exitosamente.',
        webhookReceived: 'Webhook recibido.',
        unauthorized: 'No autorizado!',
        invalidToken: 'Token no válido!',
        notFound: 'No encontrado!',
        healthOk: 'La API está funcionando.',
        featureVersionUnsupported:
            'Esta función no es compatible con la versión {{version}}. Actualiza OpenClaw o usa la Terminal para gestionarlo manualmente.',
        invalidAuthMethod: 'Método de autenticación no válido!',
        authMethodNotConnected:
            'Este método de autenticación no está conectado!',
        authMethodConnected: 'Método de autenticación conectado exitosamente.',
        authMethodDisconnected:
            'Método de autenticación desconectado exitosamente.',
        failedToConnectAuthMethod:
            'Error al conectar el método de autenticación!',
        failedToDisconnectAuthMethod:
            'Error al desconectar el método de autenticación!',
        textRequired: 'El texto es obligatorio!',
        featureEmailsDisabled:
            'Los emails de funcionalidades están actualmente desactivados.',
        featureEmailsSent: 'Emails de funcionalidades enviados exitosamente.',
        featureEmailsFailed: '¡Error al enviar los emails de funcionalidades!',
        invalidFeatureKey: '¡Clave de funcionalidad inválida!',
        waitlistJoined: 'Te has unido a la lista de espera.',
        waitlistAlreadyJoined: 'Ya estás en la lista de espera.',
        waitlistJoinFailed: '¡Error al unirse a la lista de espera!',
        waitlistRateLimited:
            '¡Vas demasiado rápido! Por favor, inténtalo de nuevo en {{seconds}} {{unit}}.',
        waitlistStatusFetched: 'Estado de la lista de espera obtenido.',
        waitlistCheckFailed:
            '¡Error al verificar el estado de la lista de espera!',
        adminUsersFetched: 'Usuarios obtenidos con éxito.',
        failedToGetAdminUsers: 'Error al obtener los usuarios!',
        adminUserDetailFetched: 'Detalles del usuario obtenidos con éxito.',
        failedToGetAdminUserDetail:
            'Error al obtener los detalles del usuario!',
        adminUserUpdated: 'Usuario actualizado.',
        failedToUpdateAdminUser: 'Error al actualizar el usuario!',
        adminStatsFetched: 'Estadísticas obtenidas.',
        failedToGetAdminStats: 'Error al obtener las estadísticas!',
        adminAnalyticsFetched: 'Análisis obtenidos exitosamente.',
        failedToGetAdminAnalytics: '¡Error al obtener análisis!',
        adminBillingFetched: 'Facturación obtenida exitosamente.',
        failedToGetAdminBilling: '¡Error al obtener facturación!',
        adminClawsFetched: 'Claws obtenidos.',
        failedToGetAdminClaws: 'Error al obtener los claws!',
        adminSSHKeysFetched: 'Claves SSH obtenidas.',
        failedToGetAdminSSHKeys: 'Error al obtener las claves SSH!',
        adminVolumesFetched: 'Volúmenes obtenidos.',
        failedToGetAdminVolumes: 'Error al obtener los volúmenes!',
        adminReferralsFetched: 'Referrals fetched.',
        failedToGetAdminReferrals: 'Failed to fetch referrals!',
        adminPendingClawsFetched: 'Pending claws fetched.',
        failedToGetAdminPendingClaws: 'Failed to fetch pending claws!',
        adminWaitlistFetched: 'Waitlist fetched.',
        failedToGetAdminWaitlist: 'Failed to fetch waitlist!',
        adminExportsFetched: 'Exports fetched.',
        adminEmailsFetched: 'Emails fetched.',
        failedToGetAdminEmails: 'Failed to fetch emails!'
    },
    emails: {
        otpSubject: 'Tu código de inicio de sesión de ClawHost',
        otpPreview: 'Tu código de inicio de sesión de ClawHost: {{code}}',
        otpHeading: 'Tu código de inicio de sesión es:',
        otpExpiry:
            'El código expira en 10 minutos. Si no fuiste tú, ignora este correo.',
        featureFooter:
            'Recibes este correo porque tienes una cuenta en ClawHost.',
        features: {
            terminal: {
                subject: 'Tienes un terminal web',
                preview: 'Ejecuta comandos en tu navegador, sin SSH',
                tag: 'Terminal Web',
                heading: 'Comandos desde tu navegador',
                description:
                    'Un terminal completo en tu panel. Haz clic en tu claw, empieza a escribir. Sin cliente SSH.',
                cta: 'Abrir Terminal'
            },
            logs: {
                subject: 'Logs en tiempo real en tu panel',
                preview: 'Mira los logs de tu servidor en vivo',
                tag: 'Logs en Vivo',
                heading: 'Tus logs en vivo',
                description:
                    'Cada solicitud, cada error, transmitido en tiempo real a tu panel. No más revisar archivos por SSH.',
                cta: 'Ver Logs'
            },
            fileExplorer: {
                subject: 'Edita archivos del servidor desde tu navegador',
                preview: 'Navega y edita archivos sin SSH',
                tag: 'Explorador de Archivos',
                heading: 'Edita archivos sin SSH',
                description:
                    'Navega, edita y guarda archivos con resaltado de sintaxis. Sin SSH, sin FTP — haz clic y escribe.',
                cta: 'Abrir Explorador'
            },
            diagnostics: {
                subject: 'Chequeos de salud integrados',
                preview: 'Verifica la salud de tu servidor en un clic',
                tag: 'Diagnósticos',
                heading: '¿Tu servidor está sano?',
                description:
                    'Verifica servicios, memoria, disco y puertos en un clic. Detecta problemas antes de que sean caídas.',
                cta: 'Ejecutar Diagnósticos'
            },
            sshKeys: {
                subject: 'Gestiona claves SSH desde ClawHost',
                preview: 'Genera y gestiona pares de claves fácilmente',
                tag: 'Claves SSH',
                heading: 'Claves SSH, simplificadas',
                description:
                    'Genera pares de claves, copia las públicas, descarga las privadas — todo desde el panel.',
                cta: 'Gestionar Claves SSH'
            },
            exportConfig: {
                subject: 'Exporta tu config de claw',
                preview: 'Descarga tu configuración en un archivo',
                tag: 'Exportar Config',
                heading: 'Lleva tu config contigo',
                description:
                    'Exporta agentes y ajustes en un solo archivo. Respalda o replica tu configuración.',
                cta: 'Exportar Config'
            },
            multiLanguage: {
                subject: 'ClawHost habla 14 idiomas',
                preview: 'Cambia el idioma del panel',
                tag: 'Multi-Idioma',
                heading: '14 idiomas, completamente traducido',
                description:
                    'Cambia ClawHost a español, inglés, francés, alemán y 10 más. Cada botón, cada mensaje.',
                cta: 'Cambiar Idioma'
            },
            subdomain: {
                subject: 'Tu claw tiene su propia URL',
                preview: 'Accede a tu claw desde cualquier lugar',
                tag: 'Subdominio',
                heading: 'Tu claw, tu URL',
                description:
                    'Cada claw obtiene un subdominio único como miclaw.clawhost.cloud. Accesible desde cualquier lugar, sin VPN.',
                cta: 'Ver Tu Subdominio'
            },
            darkMode: {
                subject: 'El modo oscuro llegó',
                preview: 'Alterna entre temas claro y oscuro',
                tag: 'Modo Oscuro',
                heading: 'Descanso para tus ojos',
                description:
                    'Alterna entre claro y oscuro con un clic. Tu preferencia se guarda automáticamente.',
                cta: 'Probar Modo Oscuro'
            },
            reinstall: {
                subject: 'Empezar de nuevo, un clic',
                preview: 'Reinstala OpenClaw sin perder tu servidor',
                tag: 'Reinstalar',
                heading: 'Nuevo inicio, mismo servidor',
                description:
                    'La reinstalación limpia el runtime de OpenClaw y te da una página en blanco. Tu servidor, IP y claves se mantienen.',
                cta: 'Saber Más'
            },
            yearlyPlans: {
                subject: 'Ahorra con facturación anual',
                preview: 'Mismo servicio, menor precio',
                tag: 'Planes Anuales',
                heading: 'Mismo claw, menor factura',
                description:
                    'Cambia a facturación anual y paga menos. Sin diferencia de funciones. Cambia cuando quieras.',
                cta: 'Ver Planes'
            }
        }
    },
    auth: {
        signIn: 'Autenticación',
        signInDescription:
            'Inicia sesión en tu cuenta de ClawHost para administrar tus instancias de OpenClaw.',
        signingIn: 'Autenticando...',
        verifyCode: 'Verificar código',
        checkYourEmail: 'Revisa tu correo',
        checkYourEmailHeading: 'Revisa tu correo',
        codeSentTo: 'Enviamos un código de 6 dígitos a',
        signInToDeployOpenClaw:
            'Autentícate para gestionar y desplegar agentes con un clic.',
        emailAddress: 'Correo electrónico',
        emailPlaceholder: 'ejemplo@clawhost.cloud',
        continueWithEmail: 'Continuar con correo',
        otpDescription:
            'Te enviaremos un código para iniciar sesión. Sin contraseña.',
        welcomeBack: 'Bienvenido de nuevo.',
        resendIn: 'Reenviar en {{seconds}}s',
        resendCode: 'Reenviar código',
        changeEmail: 'Cambiar correo',
        invalidCode: 'Código no válido!',
        invalidEmailFormat:
            'Por favor, introduce una dirección de correo electrónico válida!',
        plusAddressingNotAllowed:
            'No se permite el uso del signo + en el correo electrónico para iniciar sesión!',
        or: 'o',
        continueWithGoogle: 'Continuar con Google',
        continueWithGithub: 'Continuar con GitHub',
        agreementNotice: 'Al continuar, aceptas nuestros',
        termsOfService: 'Términos de servicio',
        andWord: 'y',
        privacyPolicy: 'Política de privacidad'
    },
    account: {
        title: 'Cuenta',
        description:
            'Administra la configuración de tu cuenta de ClawHost y tu información de perfil.',
        accountSettings: 'Cuenta',
        manageYourAccount:
            'Administra tu perfil y la configuración de tu cuenta.',
        profileInformation: 'Información del perfil',
        profileDescription: 'Tu información personal y nombre para mostrar.',
        noNameSet: 'Sin nombre establecido',
        joined: 'Registro',
        claws: 'claws',
        sshKeys: 'claves',
        displayName: 'Nombre para mostrar',
        enterYourName: 'Ingresa tu nombre',
        emailAddress: 'Correo electrónico',
        emailNotEditable: 'El correo no es editable. Contacta con soporte!',
        profileUpdatedSuccessfully: 'Perfil actualizado exitosamente.',
        billingHistory: 'Historial de facturación',
        billingDescription: 'Tu historial de pagos y facturas',
        date: 'Fecha',
        product: 'Producto',
        amount: 'Monto',
        status: 'Estado',
        statusPaid: 'Pagado',
        statusPending: 'Pendiente',
        statusRefunded: 'Reembolsado',
        statusPartiallyRefunded: 'Parcialmente reembolsado',
        billingReasonPurchase: 'Compra',
        billingReasonSubscriptionCreate: 'Nueva suscripción',
        billingReasonSubscriptionCycle: 'Renovación',
        billingReasonSubscriptionUpdate: 'Actualización de suscripción',
        noBillingHistory: 'Sin facturación',
        noBillingHistoryDescription:
            'No tienes historial de pagos, una vez que despliegues tu primer claw deberás ver tu facturación aquí.',
        failedToLoadBilling: 'Error al cargar el historial de facturación!',
        viewInvoice: 'Ver factura',
        failedToLoadInvoice: 'Error al cargar la factura!',
        couponApplied: 'Cupón: {{name}}',
        manageBilling: 'Administrar facturación',
        failedToLoadPortal: 'Error al abrir el portal de facturación!',
        connectedAccounts: 'Cuentas conectadas',
        connectedAccountsDescription:
            'Administra los métodos de inicio de sesión vinculados a tu cuenta.',
        authEmail: 'Correo',
        authGoogle: 'Google',
        authGithub: 'GitHub',
        authConnected: 'Conectado',
        authConnect: 'Conectar',
        authDisconnect: 'Desconectar',
        emailCannotBeDisconnected:
            'El correo siempre está conectado como tu método principal de inicio de sesión!',
        providerConnected: '{{provider}} conectado exitosamente.',
        providerDisconnected: '{{provider}} desconectado exitosamente.',
        providerEmailMismatch:
            'Solo puedes conectar cuentas que usen la misma dirección de correo!',
        settings: 'Configuración',
        settingsDescription: 'Administra las preferencias de tu panel.',
        openLinksWindowed: 'Abrir enlaces en vista de ventana',
        openLinksWindowedDescription:
            'Cuando está activado, los enlaces externos se abren dentro de la aplicación en lugar del navegador del sistema.'
    },
    billing: {
        title: 'Facturación',
        description:
            'Consulta tu historial de pagos y administra tu facturación.',
        billingHistory: 'Facturación',
        manageYourBilling:
            'Consulta tu historial de pagos y administra tus facturas.',
        billingDescription: 'Tu historial de pagos y facturas',
        date: 'Fecha',
        product: 'Producto',
        amount: 'Monto',
        status: 'Estado',
        statusPaid: 'Pagado',
        statusPending: 'Pendiente',
        statusRefunded: 'Reembolsado',
        statusPartiallyRefunded: 'Parcialmente reembolsado',
        billingReasonPurchase: 'Compra',
        billingReasonSubscriptionCreate: 'Nueva suscripción',
        billingReasonSubscriptionCycle: 'Renovación',
        billingReasonSubscriptionUpdate: 'Actualización de suscripción',
        noBillingHistory: 'Sin facturación',
        noBillingHistoryDescription:
            'No tienes historial de pagos, una vez que despliegues tu primer claw deberás ver tu facturación aquí.',
        failedToLoadBilling: 'Error al cargar el historial de facturación!',
        failedToLoadBillingDescription:
            'No pudimos cargar tu historial de facturación. Por favor, verifica tu conexión e intenta de nuevo.',
        viewInvoice: 'Ver factura',
        failedToLoadInvoice: 'Error al cargar la factura!',
        couponApplied: 'Cupón: {{name}}',
        manageBilling: 'Administrar facturación',
        failedToLoadPortal: 'Error al abrir el portal de facturación!'
    },
    license: {
        title: 'Licencia',
        description: 'Administra tu licencia de OpenClaw.',
        pageTitle: 'Licencia',
        pageDescription:
            'Compra tu licencia para auto-alojar instancias de OpenClaw localmente con nuestra aplicación Go.',
        planName: 'Licencia ClawHost Go',
        oneTimePurchase: 'Compra única',
        price: '${{price}}',
        priceNote: 'Paga una vez, tuyo para siempre.',
        purchaseLicense: 'Comprar licencia',
        purchasing: 'Redirigiendo...',
        activated: 'Licencia activa',
        activatedDescription: 'Tu licencia está activa. Gracias por tu apoyo.',
        paymentSuccess: 'Pago exitoso. Tu licencia ya está activa.',
        failedToPurchase: 'Error al iniciar el pago!',
        featureUnlimitedClaws: 'OpenClaws ilimitados',
        featureDevices: 'Dispositivos ilimitados',
        featureUpdates: 'Actualizaciones para siempre',
        featureSupport: 'Soporte prioritario',
        featureCloud: 'Todas las funciones en la nube, localmente',
        whatsIncluded: 'Qué incluye',
        permanentNote:
            'Las licencias son permanentes e irrevocables. Una vez comprada, es tuya para siempre.',
        gateTitle: 'Licencia requerida',
        gateDescription:
            'Necesitas una licencia ClawHost Go para desplegar y gestionar instancias de OpenClaw localmente.'
    },
    network: {
        unstable: 'Conexión inestable',
        unstableDescription:
            'Tu conexión a internet es inestable. Algunas funciones podrían no funcionar correctamente.',
        offline: 'Sin conexión a internet',
        offlineDescription:
            'Actualmente estás sin conexión. Las funciones que requieren acceso a internet no estarán disponibles.',
        dismiss: 'Cerrar'
    },
    dashboard: {
        title: 'Claws',
        description:
            'Visualiza y administra tus instancias de OpenClaw desplegadas. Inicia, detiene, reinicia y monitorea tus servidores VPS.',
        claw: 'claw',
        clawsPlural: 'claws',
        clawCountLabel: '{{count}} claws',
        clawCountLabelSingular: '{{count}} claw',
        newClaw: 'Nuevo Claw',
        searchAgents: 'Buscar agentes...',
        searchAgentsCount: 'Buscar {{count}} agentes...',
        noAgentsMatchSearch:
            'No se encontraron agentes que coincidan con tu búsqueda.',
        clawActions: 'Acciones del claw',
        noAgentsYet: 'Sin Agentes',
        noAgentsDescription:
            'No se encontró ningún agente desplegado. Pero puedes desplegar tu primer agente en cualquier momento desde $25/m. Solo usa IA.',
        deleteClaw: 'Eliminar Claw',
        deleteClawConfirmation: '¿Estás seguro de que deseas eliminar',
        deleteClawWarning:
            'Tu suscripción será cancelada y el servidor será eliminado al final de tu período de facturación actual. Puedes seguir usándolo hasta entonces.',
        actionCannotBeUndone: 'Esta acción no se puede deshacer.',
        start: 'Iniciar',
        stop: 'Detener',
        restart: 'Reiniciar',
        stopClaw: 'Detener Claw',
        stopClawConfirmation:
            '¿Estás seguro de que deseas detener el servidor? Esto terminará todo lo que se está ejecutando, incluyendo OpenClaw, pero puedes iniciarlo en cualquier momento. Detener no detiene la facturación — elimina el servidor para dejar de ser cobrado.',
        restartClaw: 'Reiniciar Claw',
        restartClawConfirmation:
            '¿Estás seguro de que deseas reiniciar el servidor? Esto terminará todo lo que se está ejecutando, incluyendo OpenClaw.',
        copyPassword: 'Copiar contraseña',
        copySshWithKey: 'Copiar SSH (con clave)',
        copySshWithPassword: 'Copiar SSH (con contraseña)',
        connect: 'Copiar comando SSH',
        viewServerCredentials: 'Credenciales del servidor',
        serverCredentials: 'Credenciales del servidor',
        serverCredentialsDescription:
            'Usa estas credenciales para conectarte a tu servidor por SSH.',
        sshCommand: 'Comando SSH',
        rootPassword: 'Contraseña root',
        sshCommandCopied: 'Comando SSH copiado.',
        sshCommandWithPasswordCopied: 'Comando SSH con contraseña copiado.',
        passwordCopiedToClipboard: 'Contraseña copiada al portapapeles.',
        plan: 'Servidor',
        location: 'Ubicación',
        ip: 'IP',
        domain: 'Dominio',
        ipAddress: 'Dirección IP',
        port: 'Puerto',
        planCost: 'Plan',
        serverId: 'ID del servidor',
        created: 'Creado',
        sshKey: 'Clave SSH',
        storage: 'Almacenamiento',
        nextBilling: 'Próxima facturación',
        lastBilling: 'Última facturación',
        version: 'Versión',
        gatewayToken: 'Token del gateway',
        gatewayTokenDescription:
            'Usa este token para autenticarte con tu gateway',
        contactSupport: 'Contactar Soporte',
        scheduledForDeletion: 'Programado para eliminación',
        scheduledDeletionShort: 'Se elimina el {{date}}',
        deletionDate: 'Este claw será eliminado el {{date}}',
        deletionTooltip:
            'Programado para eliminación el {{date}}. Para cancelar, usa el menú.',
        pastDue: 'Pago fallido',
        deletionFailed: 'Eliminación fallida',
        pastDueDescription:
            'Tu pago falló. Si no se resuelve en 14 días, este claw será eliminado permanentemente.',
        updatePayment: 'Actualizar pago',
        cancelDeletion: 'Cancelar eliminación',
        deletionCancelled: 'Eliminación cancelada.',
        scheduleDeletion: 'Programar eliminación',
        resumeCheckout: 'Continuar pago',
        cancelPurchase: 'Cancelar compra',
        hardDelete: 'Eliminar inmediatamente',
        hardDeleteClaw: 'Eliminar inmediatamente',
        hardDeleteConfirmation:
            '¿Estás seguro de que deseas eliminar este claw inmediatamente? Perderás el tiempo restante de tu período de facturación actual. Esta acción no se puede deshacer.',
        diagnostics: 'Diagnósticos',
        diagnosticsDescription:
            'Verifica el estado de tu instancia de OpenClaw.',
        diagnosticsStatus: 'Estado',
        diagnosticsLogs: 'Registros',
        diagnosticsRepair: 'Repair',
        diagnosticsRepairDescription:
            'Remove memory limits, apply latest service configuration, and restart the gateway. This fixes most common issues.',
        diagnosticsRepairSuccess: 'Instance repaired successfully.',
        diagnosticsRepairFailed:
            'Repair applied but gateway is not responding yet!',
        diagnosticsLoading: 'Conectando a la instancia...',
        diagnosticsNoLogs:
            'No hay registros disponibles. Inicia tu instancia para generar registros.',
        diagnosticsIssueDetected: 'Se detectó un problema con tu instancia!',
        diagnosticsHealthy: 'Tu instancia está funcionando normalmente.',
        diagnosticsPort: 'Puerto 18789',
        diagnosticsMemory: 'Memoria',
        logsDescription:
            'Últimas 100 líneas del registro de tu gateway, actualizándose automáticamente.',
        fileExplorer: 'Explorador de archivos',
        fileExplorerRoot: 'openclaw',
        fileExplorerDescription:
            'Explora y edita tus archivos de configuración de OpenClaw. Los cambios incorrectos pueden dañar tu instancia.',
        fileExplorerSelectFile: 'Selecciona un archivo para ver su contenido.',
        fileExplorerReadOnly: 'Solo lectura',
        fileExplorerSave: 'Guardar',
        fileExplorerSaved: 'Archivo guardado.',
        fileExplorerInvalidJson:
            'JSON no válido. Por favor, corrige los errores de sintaxis antes de guardar!',
        fileExplorerNoFiles: 'No se encontraron archivos',
        fileExplorerSearchFiles: 'Buscar archivos...',
        fileExplorerNoSearchResults: 'No hay archivos coincidentes.',
        startFailed: 'Error al iniciar el claw!',
        renameSuccess: 'Claw renombrado exitosamente.',
        renameFailed: 'Error al renombrar el claw!',
        renameInvalidChars: 'Solo se permiten letras, números y guiones!',
        reinstallInstance: 'Reinstalar instancia',
        reinstallClaw: 'Reinstalar instancia',
        reinstallClawConfirmation:
            'Esto reinstalará completamente OpenClaw en esta instancia. Todas las configuraciones, agentes y datos serán restablecidos. Esta acción no se puede deshacer. ¿Continuar?',
        reinstallInstanceSuccess: 'Instancia reinstalada exitosamente.',
        reinstallInstanceFailed: 'Error al reinstalar la instancia!',
        openControlPanel: 'Abrir panel de control',
        exportData: 'Exportar Claw (.zip)',
        exportAgent: 'Exportar',
        exportAgentButton: 'Exportar OpenClaw',
        exportAgentTooltip: 'Descargar este agente y todos sus datos como archivo .zip.',
        exportStarted:
            'Preparando la exportación, esto puede tardar un momento...',
        exportSuccess: 'Claw exportado con éxito.',
        exportFailed: 'Error al exportar los datos del claw!',
        exportRateLimited: 'Puedes exportar de nuevo en {{minutes}} minutos!',
        exportRateLimitedSeconds:
            'Puedes exportar de nuevo en {{seconds}} segundos!',
        configuringTooltip:
            'Esto puede tardar un poco. Depende de OpenClaw, la ubicación del servidor y Cloudflare DNS.',
        paymentSuccess: 'Tu claw se está creando y configurando.',
        dnsSetupBanner:
            'Configura el DNS local para acceder a tus claws vía subdominio.clawhost.',
        dnsSetupButton: 'Configurar DNS',
        dnsSetupSuccess: 'Resolvedor DNS configurado exitosamente.',
        dnsSetupError: '¡Error al configurar el resolvedor DNS!',
        userTab: 'Usuario',
        adminTab: 'Admin',
        adminTitle: 'Admin',
        adminDescription: 'Administra todos los claws de la plataforma.',
        adminNoClaws: 'Aún no hay claws en la plataforma.',
        adminAccessDenied: 'No tienes permiso para acceder a esta página!',
        owner: 'Propietario',
        agentType: 'Agent',
        status: {
            running: 'Ejecutándose',
            stopped: 'Detenido',
            starting: 'Iniciando',
            stopping: 'Deteniendo',
            creating: 'Creando',
            configuring: 'Configurando',
            initializing: 'Preparando',
            migrating: 'Migrando',
            rebuilding: 'Reconstruyendo',
            restarting: 'Reiniciando',
            unreachable: 'Inaccesible',
            deleting: 'Eliminando',
            scheduledDeletion: 'Eliminación programada',
            awaitingPayment: 'Esperando pago',
            unknown: 'Desconocido',
            checking: 'Verificando'
        }
    },
    createClaw: {
        title: 'Desplegar OpenClaw',
        description: 'Configura tu servidor y comienza a construir con IA.',
        clawName: 'Nombre',
        clawNamePlaceholder: 'ej. panda-acogedor',
        clawNameInvalidChars: 'Solo se permiten letras, números y guiones!',
        autoGenerateNameHint:
            'Dejar vacío para generar un nombre automáticamente.',
        location: 'Ubicación',
        locationUnavailable: 'No disponible',
        locationUnavailableForPlan: 'No disponible',
        plan: 'Servidor',
        planUnavailable: 'No disponible',
        planUnavailableForLocation: 'No disponible en esta ubicación',
        advancedOptions: 'Opciones avanzadas opcionales',
        rootPassword: 'Contraseña root',
        rootPasswordPlaceholder: 'Ingresa una contraseña o genera una',
        gatewayTokenPlaceholder: 'ej. a1b2c3d4e5f6...',
        autoGenerateGatewayTokenHint: 'Opcional. Sin token si se deja vacío.',
        autoGeneratePasswordHint: 'Opcional. Sin contraseña si se deja vacío.',
        regeneratePassword: 'Regenerar contraseña',
        sshKeyOptional: 'Clave SSH',
        noSshKeyPasswordOnly: 'Sin clave SSH (solo contraseña)',
        noSshKeysConfigured: 'No hay claves SSH configuradas',
        addSshKeyForPasswordlessLogin:
            'Agrega una clave SSH para inicio de sesión sin contraseña',
        additionalStorageOptional: 'Almacenamiento adicional',
        volumeStorage: 'Almacenamiento de volumen',
        vpsServer: 'Servidor VPS',
        openClawPreinstalled: 'OpenClaw preinstalado',
        storageWithSize: 'Almacenamiento',
        billingInterval: 'Facturación',
        monthly: 'Mensual',
        yearly: 'Anual',
        yearlySaveBadge: '2 meses gratis',
        yearlySavings: 'Ahorras',
        totalMonthly: 'Total mensual',
        totalYearly: 'Total anual',
        creating: 'Creando...',
        proceedToPayment: 'Pagar ${{amount}} para desplegar',
        agreementNotice: 'Al desplegar, aceptas nuestros',
        selectServerToContinue: 'Selecciona un servidor para continuar',
        selectLocationToContinue: 'Selecciona una ubicación para continuar',
        clawCreated: 'Claw creado.',
        assigning: 'Asignando...',
        rootPasswordSaveThis: 'Contraseña root (¡guarda esto!)',
        sshCommandUsingKey: 'Comando SSH (usando tu clave)',
        sshCommandWithPassword: 'Comando SSH (con contraseña)',
        passwordCopied: 'Contraseña copiada.',
        planSpec: '{{cpu}} vCPU / {{memory}} GB RAM / {{disk}} GB SSD',
        volumeUnit: 'GB',
        volumeMin: '0 GB',
        volumeMax: '500 GB'
    },
    sshKeys: {
        title: 'Claves SSH',
        description:
            'Administra tus claves SSH para acceso seguro y sin contraseña a tus instancias de OpenClaw.',
        key: 'clave ssh',
        keys: 'claves ssh',
        keyCountDescription: '{{count}} {{label}}',
        addSshKey: 'Agregar clave SSH',
        howSshKeysWork: '¿Cómo conectar una clave SSH?',
        step1: 'Genera un par de claves SSH en tu computadora (o usa uno existente).',
        step2: 'Agrega la clave pública aquí.',
        step3: 'Selecciona la clave al crear una nueva instancia.',
        step4: 'Conéctate con',
        step4Command: 'ssh root@your-server-ip',
        step4Suffix: '- sin contraseña necesaria.',
        noSshKeysYet: 'Sin claves SSH',
        noSshKeysDescription:
            'No hay claves SSH agregadas en tu cuenta, puedes agregarlas en cualquier momento y conectarte con tus claws desplegados.',
        deleteConfirmation:
            '¿Estás seguro de que deseas eliminar esta clave SSH?',
        deleteKey: 'Eliminar clave SSH',
        deleteKeyConfirmation: '¿Estás seguro de que deseas eliminar',
        sshKeyAddedSuccessfully: 'Clave SSH agregada exitosamente.',
        addSshKeyModalTitle: 'Agregar clave SSH',
        addSshKeyModalDescription:
            'Agrega una clave SSH para autenticación sin contraseña',
        iHaveAnSshKey: 'Clave existente',
        generateNewKey: 'Crear nueva',
        name: 'Nombre',
        namePlaceholder: 'ej: mi-macbook',
        publicKey: 'Clave pública',
        publicKeyPlaceholder: 'ssh-rsa AAAA... o ssh-ed25519 AAAA...',
        publicKeyHint: 'Encuentra tu clave pública en',
        publicKeyPath1: '~/.ssh/id_ed25519.pub',
        publicKeyPathOr: 'o',
        publicKeyPath2: '~/.ssh/id_rsa.pub',
        important: 'Importante:',
        dontHaveSshKey: '¿No tienes una clave SSH? Genera una:',
        sshKeygenCommand: 'ssh-keygen -t ed25519 -C "your-email@example.com"',
        keyName: 'Nombre de la clave',
        keyNamePlaceholder: 'Mi clave generada',
        importantAfterGenerating:
            'Después de generar, debes descargar y guardar tu clave privada. No podremos recuperarla si la pierdes.',
        generateKeyPair: 'Generar par de claves',
        orGenerateLocallyRecommended: 'O genera localmente (recomendado)',
        runThisInYourTerminal: 'Ejecuta esto en tu terminal:',
        thenSwitchToIHave:
            'Luego cambia a "Clave existente" y pega la clave pública.',
        savePrivateKeyNow:
            'Guarda tu clave privada AHORA. Descárgala antes de cerrar este diálogo. No podrás verla de nuevo.',
        privateKeyKeepSecret: 'Clave privada (mantén en secreto)',
        downloadPrivateKey: 'Descargar clave privada',
        publicKeyWillBeSaved: 'Clave pública (será guardada)',
        savePublicKey: 'Guardar clave pública'
    },
    landing: {
        title: 'Despliega OpenClaw. Un clic. Listo.',
        description:
            'Despliega OpenClaw en tu propio VPS con un solo clic. Alojamiento en la nube auto-hospedable con acceso root completo, ubicaciones globales y precios transparentes.',
        badge: 'OpenClaw simplificado',
        tutorialBadge: 'Mira. Despliega.',
        tutorialVideoThumbnail: 'Miniatura del video tutorial de ClawHost',
        heroTitle1: 'Despliega OpenClaw.',
        heroTitle2: 'Un clic. Listo.',
        heroDescription:
            'Despliega agentes OpenClaw en la nube o en local con un clic — crea, conecta y escala tus agentes de IA más rápido con ClawHost.',
        goToClaws: 'Ir a Claws',
        selfHost: 'Código abierto',
        startingPrice: 'Desde',
        locations: 'Ubicaciones',
        servers: 'Servidores',
        zeroCount: 'Cero',
        zeroConfig: 'Sin configuración',
        dashboardPreviewTitle: 'Claws',
        dashboardPreviewSubtitle: '5 claws agregados',
        deployNew: 'Desplegar nuevo',
        running: 'Ejecutándose',
        latency: 'latencia',
        howItWorks: 'Proceso',
        threeStepsToPrivacy: 'Tres pasos hacia OpenClaw',
        howItWorksDescription:
            'De cero a un OpenClaw completamente desplegado para usar 24/7 con acceso completo.',
        step1Title: 'Selecciona servidor',
        step1Description:
            'Elige entre más de 30 ubicaciones globales en tres proveedores. Creamos un VPS dedicado solo para ti en segundos.',
        step2Title: 'Instalación automática',
        step2Description:
            'OpenClaw viene preinstalado con un enlace directo y los detalles del VPS. Sin configuración necesaria.',
        step3Title: 'Es tuyo',
        step3Description:
            'Acceso completo a OpenClaw y al VPS, sin límites en lo que puedes lograr.',
        features: 'Funciones',
        whyClawHost: 'Todas las funciones',
        featuresDescription:
            'Por qué vale la pena probarnos, las características no mienten.',
        zeroConfigDescription:
            'Ahorra horas de configuración de servidor y OpenClaw. Está preinstalado y listo en minutos.',
        ownedData: 'Datos 100% tuyos',
        ownedDataDescription:
            'Tu propio servidor, tus datos. Sin infraestructura compartida, sin registros, sin terceros. En línea 24/7.',
        fullSpeed: 'Velocidad máxima',
        fullSpeedDescription:
            'Recursos VPS dedicados significan sin limitaciones, ancho de banda completo e internet ultra rápido.',
        globalLocations: 'Ubicaciones globales',
        globalLocationsDescription:
            'Despliega OpenClaw en múltiples regiones globales y elige la ubicación más cercana a ti.',
        fullSshAccess: 'Acceso SSH directo',
        fullSshAccessDescription:
            'Accede al terminal de tu servidor directamente desde la plataforma. Sin necesidad de clientes SSH externos.',
        secure: 'Seguro',
        secureDescription:
            'Protegido por defecto contra vulnerabilidades SSL, malware y amenazas de seguridad comunes.',
        payAsYouGo: 'Precios simples',
        payAsYouGoDescription:
            'Precios basados en lo que necesitas. Sin facturas altas forzadas por servidores de baja calidad. Cancela en cualquier momento.',
        customSubdomains: 'Acceso en línea',
        customSubdomainsDescription:
            'Olvida las redes locales. Accede a tu OpenClaw de forma segura desde cualquier lugar con un subdominio.',
        autoUpdates: 'Control de versiones',
        autoUpdatesDescription:
            'Cambia a cualquier versión de OpenClaw con un solo clic. Mantente siempre actualizado o vuelve atrás cuando lo necesites.',
        openclawControl: 'Control OpenClaw',
        openclawControlDescription:
            'Accede al panel nativo de OpenClaw directamente desde ClawHost. Acceso completo de edición a todo lo que OpenClaw ofrece.',
        clawHostControl: 'Acceso completo al servidor',
        clawHostControlDescription:
            'Terminal en navegador, explorador de archivos, logs, diagnósticos y gestión de versiones — todo desde tu panel.',
        multipleClaws: 'Múltiples Claws',
        multipleClawsDescription:
            'Despliega y gestiona múltiples instancias de OpenClaw desde un solo panel. Escala según crezcas.',
        testimonials: 'Testimonios',
        whatPeopleSay: 'Lo que dice la gente',
        testimonialsDescription:
            'No solo confíes en nuestra palabra. Mira cómo otros despliegan OpenClaw.',
        testimonial1Quote:
            'Por fin, mi propio servidor de IA. La configuración tomó 30 segundos y lo he estado usando por meses sin problemas.',
        testimonial1Author: 'Alex Chen',
        testimonial1Role: 'Desarrollador de software',
        testimonial2Quote:
            'Ya no comparto recursos con otros. Mi instancia de OpenClaw maneja todo lo que le exijo.',
        testimonial2Author: 'Maria Santos',
        testimonial2Role: 'Nómada digital',
        testimonial3Quote:
            'El despliegue en un clic es real. No soy nada técnico pero puse mi OpenClaw a funcionar en menos de un minuto.',
        testimonial3Author: 'James Wilson',
        testimonial3Role: 'Freelancer',
        testimonial4Quote:
            'Me encanta poder ver exactamente lo que está corriendo en mi servidor. Control total sobre mi configuración de IA.',
        testimonial4Author: 'Sophie Kim',
        testimonial4Role: 'Entusiasta de IA',
        pricing: 'Precios',
        simpleTransparentPricing: 'Precios simples y transparentes',
        pricingDescription:
            'Elige un plan que se adapte a tus necesidades. Sin tarifas ocultas.',
        planColumn: 'Servidor',
        vCpuColumn: 'vCPU',
        ramColumn: 'RAM',
        storageColumn: 'Almacenamiento',
        monthlyColumn: 'Precio',
        tierShared: 'vCPU compartido',
        tierDedicated: 'vCPU dedicado',
        tierArm: 'Ampere (ARM)',
        tierRegular: 'Rendimiento regular',
        tierHighPerformance: 'Alto rendimiento',
        tierHighFrequency: 'Alta frecuencia',
        recommended: 'Recomendado',
        perMonth: '/mes',
        perYear: '/año',
        pricePerMonth: '${{price}}/mo',
        pricePerYear: '${{price}}/yr',
        volumePricePerMonth: '+${{price}}/mo',
        startingPriceValue: '${{price}}/mo',
        yearlyDiscount: '— 2 meses gratis',
        billedYearly: 'facturado anualmente',
        deploy: 'Desplegar',
        select: 'Seleccionar',
        selectPlanLabel: 'Seleccionar plan {{plan}}',
        deployPlanLabel: 'Desplegar plan {{plan}}',
        openClawPreinstalled: 'OpenClaw preinstalado',
        unlimitedBandwidth: 'Ancho de banda ilimitado',
        rootSshAccess: 'Acceso root SSH completo',
        onlineAllDay: 'En línea 24/7',
        highQualityInternet: 'Internet de alta calidad',
        showAllPlans: 'Ver todos los planes',
        simplePricing: 'Simplificado',
        planStarter: 'Starter',
        planStarterDesc: '2 vCPU · 4 GB RAM · 40 GB',
        planGrowth: 'Growth',
        planGrowthDesc: '3 vCPU · 4 GB RAM · 80 GB',
        planPro: 'Pro',
        planProDesc: '4 vCPU · 16 GB RAM · 160 GB',
        planBusiness: 'Business',
        planBusinessDesc: '8 vCPU · 32 GB RAM · 240 GB',
        choosePlan: 'Elegir plan',
        mostPopular: 'Más popular',
        featurePreinstalled: 'OpenClaw preinstalado',
        featureBandwidth: 'Ancho de banda ilimitado',
        featureSsh: 'Acceso SSH root',
        featureUptime: 'En línea 24/7',
        featureSharedCpu: 'CPU compartida',
        featureDedicatedCpu: 'CPU dedicada',
        featureCommunitySupport: 'Soporte comunitario',
        featureInfraSupport: 'Soporte de infraestructura',
        featureEmailSupport: 'Soporte por correo',
        fastInternet: 'Internet rápido',
        emailSupport: 'Soporte por correo',
        faqTitle: 'Preguntas',
        frequentlyAskedQuestions: 'Preguntas frecuentes',
        faqDescription: 'Todas las preguntas frecuentes, respondidas.',
        faq1Question: '¿Qué es ClawHost?',
        faq1Answer:
            'ClawHost es una plataforma creada para hacer OpenClaw accesible para todos. Permite tanto a usuarios no técnicos como a desarrolladores ejecutar OpenClaw sin administrar infraestructura. Nosotros manejamos servidores, disponibilidad, seguridad y mantenimiento — tú solo usas OpenClaw.',
        faq2Question: '¿Qué es OpenClaw?',
        faq2Answer:
            'OpenClaw es una capa de acceso seguro auto-hospedada para tus herramientas y servicios de IA. Está preconfigurado para seguridad y rendimiento, así que puedes desplegarlo y conectarte al instante.',
        faq3Question:
            '¿En qué se diferencia de otras herramientas de IA o plataformas hospedadas?',
        faq3Answer:
            'A diferencia de las herramientas de IA hospedadas, ClawHost te da un servidor real con OpenClaw instalado. Tú eres dueño de la infraestructura, controlas todo y no estás limitado por una plataforma compartida o un modelo.',
        faq4Question: '¿Necesito conocimientos técnicos?',
        faq4Answer:
            'No. Nosotros manejamos toda la infraestructura, configuración y mantenimiento. Puedes configurar y administrar OpenClaw a través de su interfaz y personalizar el uso — sin tocar servidores ni infraestructura.',
        faq5Question: '¿Qué ubicaciones están disponibles?',
        faq5Answer:
            'Ofrecemos múltiples ubicaciones de servidores en todo el mundo, incluyendo Estados Unidos, Europa y más. Puedes desplegar OpenClaw en múltiples servidores en diferentes regiones si es necesario.',
        faq6Question: '¿Cuánto cuesta?',
        faq6Answer:
            'Los precios dependen del servidor que selecciones. Con múltiples opciones de servidores que van desde nivel básico hasta alto rendimiento, eliges lo que se adapte a tus necesidades y presupuesto.',
        faq7Question: '¿Puedo acceder a mi servidor directamente?',
        faq7Answer:
            'Sí. Además del acceso a OpenClaw vía URL de subdominio, tienes acceso completo al servidor y su infraestructura subyacente, dándote libertad total para personalizar y ejecutar lo que necesites.',
        comparison: 'Comparación',
        comparisonTitle: '¿En qué nos diferenciamos?',
        comparisonDescription:
            'Solo hay una plataforma comparable, y nuestro enfoque se centra en servidores reales y propiedad total en lugar de limitaciones.',
        others: 'Otros',
        comparisonOpenClawUs: 'Acceso completo a OpenClaw',
        comparisonOpenClawOthers: 'Solo chat, sin administración',
        comparisonPricingUs: 'Precios transparentes, especificaciones claras',
        comparisonPricingOthers:
            'Especificaciones ocultas, precios poco claros',
        comparisonOwnershipUs: 'Tu servidor es completamente tuyo',
        comparisonOwnershipOthers: 'No eres dueño de nada',
        comparisonSubdomainUs: 'Acceso vía subdominio',
        comparisonSubdomainOthers:
            'Acceso solo a través de plataformas de terceros',
        comparisonInfraUs: 'Infraestructura bajo demanda',
        comparisonInfraOthers: 'Servidores limitados',
        comparisonDataUs: 'Tus datos son tuyos',
        comparisonDataOthers: 'Tus datos no son tuyos',
        comparisonMultipleUs: 'Múltiples OpenClaw, un solo Claw',
        comparisonMultipleOthers: 'Solo un OpenClaw',
        comparisonOpenSourceUs: 'Completamente código abierto',
        comparisonOpenSourceOthers: 'Código cerrado',
        comparisonExportUs: 'Exporta tu OpenClaw a cualquier lugar',
        comparisonExportOthers: 'Dependencia del proveedor',
        comparisonProvidersUs: 'Múltiples proveedores de servidores',
        comparisonProvidersOthers: 'Un solo proveedor',
        comparisonSocialsUs: 'Presencia en redes sociales',
        comparisonSocialsOthers: 'Sin redes sociales',
        comparisonVersionUs: 'Cambio de versión con un clic',
        comparisonVersionOthers: 'Actualizaciones manuales únicamente',
        comparisonTerminalUs: 'Terminal web integrada',
        comparisonTerminalOthers: 'Se requiere cliente SSH',
        seeFullComparison: 'Ver comparación completa',
        comparisonCtaText:
            'Comparamos con SimpleClaw, MyClaw.ai y más — función por función.',
        readyToOwnYourPrivacy: '¿Listo para desplegar OpenClaw?',
        ctaDescription:
            'Obtén un servidor dedicado con OpenClaw preinstalado. Acceso root completo, ubicaciones globales y listo en minutos. Es tuyo en todo momento. Desde $25.',
        deployOpenClawNow: 'Desplegar OpenClaw',
        selfHostInstead: 'Auto-hospedar en su lugar',
        noCreditCardRequired: 'Configuración instantánea',
        deployIn60Seconds: 'Seguro',
        demoClawStarted: 'Claw iniciado.',
        demoClawStopped: 'Claw detenido.',
        demoClawRestarting: 'Reiniciando claw...',
        demoClawRestarted: 'Claw reiniciado.',
        demoClawDeleted: 'Claw eliminado.',
        demoStatus: '{{running}} ejecutándose, {{total}} en total'
    },
    blog: {
        title: 'Blog',
        description:
            'Guías, tutoriales y noticias sobre OpenClaw e infraestructura auto-hospedada.',
        readingTime: '{{minutes}} min de lectura',
        publishedOn: 'Publicado el {{date}}',
        writtenBy: 'Por {{author}}',
        backToBlog: 'Volver al blog',
        noPosts: 'Sin publicaciones aún',
        noPostsDescription:
            'Las publicaciones del blog llegarán pronto. Vuelve más tarde.',
        ctaTitle: 'Despliega OpenClaw con un clic',
        ctaDescription:
            'Obtén un servidor dedicado con OpenClaw preinstalado. Acceso root completo, ubicaciones globales y listo en minutos. Es tuyo en todo momento. Desde $25.',
        ctaDeploy: 'Desplegar OpenClaw',
        ctaGitHub: 'Ver en GitHub'
    },
    changelog: {
        title: 'Historial de cambios',
        description:
            'Sigue las actualizaciones, nuevas funciones y mejoras de ClawHost.',
        subtitle:
            'Todas las actualizaciones, nuevas funciones y mejoras de ClawHost.',
        upcomingRelease: 'En proceso',
        upcomingReleaseTitle: 'App móvil y más',
        upcomingReleaseDescription:
            'Administra tus instancias de OpenClaw desde cualquier lugar. Una app móvil nativa, además de mejoras continuas de la plataforma.',
        upcomingReleaseFeature1:
            'App móvil nativa para monitorear y administrar tus instancias de OpenClaw en movimiento',
        upcomingReleaseFeature13:
            'Versión beta de ClawHost Go para macOS y Windows, despliega OpenClaw localmente con un clic',
        upcomingReleaseFeature14:
            'Despliegue con un clic para agentes Hermes como OpenClaw',
        upcomingReleaseFeature3: 'Soporte de temas oscuro y claro',
        upcomingReleaseFeature4:
            'Mejoras de rendimiento, estabilidad y capacidad de respuesta',
        upcomingReleaseFeature5:
            'Soporte multilingüe con inglés, francés, español y alemán',
        upcomingReleaseFeature6:
            'Páginas de comparación con análisis completos frente a competidores',
        upcomingReleaseFeature7:
            'Refactorización de la estructura de funciones del playground y simplificaciones',
        upcomingReleaseFeature8:
            'Solicitudes de funciones gestionadas y publicadas automáticamente por los agentes de OpenClaw',
        upcomingReleaseFeature9:
            'Modo de voz para interactuar con los agentes de OpenClaw alojados en ClawHost (Beta)',
        upcomingReleaseFeature10:
            'Reinstalar OpenClaw en tu instancia para empezar de cero, disponible una vez al día',
        upcomingReleaseFeature11:
            'Página de presentación de ClawHost Go, alojamiento local con ClawHost',
        upcomingReleaseFeature12:
            'Aplicación de escritorio para macOS y Windows para desplegar OpenClaw localmente con un clic',
        release15Date: '11 de abril de 2026',
        release15Title: 'Simplificación y subdominios personalizados',
        release15Description:
            'Simplificación de la plataforma migrando las funcionalidades gestionadas a OpenClaw, eliminación de la vista playground e introducción de subdominios personalizados modificables.',
        release15Feature1:
            'Simplificación y migración de funcionalidades gestionadas a OpenClaw, sin más chat, agentes, canales, variables y habilidades de ClawHost',
        release15Feature2:
            'Enhanced file explorer with full editing support, 100+ language syntax highlighting, and export as .zip',
        release15Feature3:
            'Removed playground view for a cleaner, more focused dashboard experience',
        release15Feature4:
            'Changeable custom subdomains, update your claw subdomain to your loved one',
        release14Date: '1 de abril de 2026',
        release14Title:
            'Migración a Hetzner, sistema de afiliados y nuevos idiomas',
        release14Description:
            'Centralización de toda la infraestructura en Hetzner para los mejores precios y rendimiento, lanzamiento del sistema de afiliados con 15% de comisiones, incorporación de 10 nuevos idiomas y creación de herramientas internas para soporte estable de versiones.',
        release14Feature1:
            'Eliminación de DigitalOcean y Vultr — toda la infraestructura ahora funciona exclusivamente en Hetzner con capacidad infinita y sin limitaciones del proveedor',
        release14Feature2:
            'Sistema de afiliados que permite a los usuarios ganar un 15% de comisión en cada pedido referido',
        release14Feature3:
            '10 nuevos idiomas añadidos: chino, hindi, árabe, ruso, japonés, turco, italiano, polaco, neerlandés y portugués',
        release14Feature4:
            'Herramientas internas para proporcionar soporte estable de funcionalidades para las versiones actuales de OpenClaw, sin soporte para versiones anteriores',
        release12Date: '14 de marzo de 2026',
        release12Title: 'Planes anuales, modo de voz y más',
        release12Description:
            'Suscripciones anuales con 2 meses gratis, modo de voz, reinstalación de instancia y una página de presentación inicial para ClawHost Go.',
        release12Feature1:
            'Página de presentación de ClawHost Go, alojamiento local con ClawHost',
        release12Feature2:
            'Soporte de suscripción anual con 2 meses gratis al suscribirte anualmente',
        release12Feature3:
            'Modo de voz para interactuar con los agentes de OpenClaw alojados en ClawHost',
        release12Feature4:
            'Reinstalar OpenClaw en tu instancia para empezar de cero, disponible una vez al día',
        release11Date: '28 de febrero de 2026',
        release11Title:
            'Texto a voz, terminal, pestañas de chat y explorador de archivos',
        release11Description:
            'Escucha las respuestas de los agentes con texto a voz, interactúa con tu VPS directamente a través del terminal, navega más rápido en los chats con las pestañas de la barra lateral, y explora archivos con el explorador mejorado.',
        release11Feature1:
            'Texto a voz en los mensajes de agentes en el playground',
        release11Feature2:
            'Terminal para interactuar con tus instancias VPS directamente desde el panel de control',
        release11Feature3:
            'Pestañas de vista de la barra lateral del chat para acceso y navegación fáciles',
        release11Feature4:
            'Mejoras en el explorador de archivos con barra de búsqueda para buscar entre archivos',
        release11Feature5:
            'Corrección de las marcas de tiempo de los mensajes que no reflejaban el tiempo real',
        release10Date: '22 de febrero de 2026',
        release10Title:
            'Solicitudes de funciones, explorador de archivos y correcciones',
        release10Description:
            'Solicitudes de funciones de la comunidad, soporte ampliado de edición de archivos y varias correcciones.',
        release10Feature1:
            'Solicitudes de funciones gestionadas y publicadas automáticamente por los agentes de OpenClaw',
        release10Feature3:
            'Corrección del cambio de proveedor de modelo que no se reflejaba y seguía usando el modelo inicial',
        release10Feature4:
            'Varias mejoras y correcciones de errores en la plataforma',
        release10Feature5:
            'Los archivos TypeScript, Markdown y texto plano ahora son editables en el explorador de archivos',
        release9Date: '21 de febrero de 2026',
        release9Title: 'Comparaciones, refactorización del playground y más',
        release9Description:
            'Páginas de comparación con competidores, reestructuración de funciones del playground, soporte multilingüe y mejoras generales de rendimiento.',
        release9Feature1: 'Soporte de temas oscuro y claro',
        release9Feature2:
            'Soporte multilingüe con inglés, francés, español y alemán',
        release9Feature3:
            'Páginas de comparación con análisis completos frente a competidores',
        release9Feature4:
            'Versiones de OpenClaw, actualiza con un clic o instala cualquier versión al instante',
        release9Feature5:
            'Refactorización de la estructura de funciones del playground y simplificaciones',
        release9Feature6:
            'Mejoras de rendimiento, estabilidad y capacidad de respuesta',
        release8Date: '18 de febrero de 2026',
        release8Title: 'Tema claro, rendimiento y estabilidad',
        release8Description:
            'Soporte de tema claro, mejoras de rendimiento y experiencia, y mejoras de estabilidad y capacidad de respuesta.',
        release8Feature1: 'Modos de tema claro, oscuro y del sistema',
        release8Feature2: 'Mejoras de rendimiento y experiencia',
        release8Feature3: 'Mejoras de estabilidad y capacidad de respuesta',
        release7Date: '16 de febrero de 2026',
        release7Title: 'Refactorización del chat y entrada de voz',
        release7Description:
            'Grandes mejoras en el chat y playground con interacción por voz y archivos adjuntos para agentes.',
        release7Feature1:
            'Refactorización del chat y playground para una experiencia más fluida y responsiva',
        release7Feature2:
            'Interacción por voz en chats, graba y transcribe voz directamente en el navegador',
        release7Feature4:
            'Vista y uso de archivos adjuntos para agentes, envía imágenes y documentos en el chat',
        release6Date: '16 de febrero de 2026',
        release6Title: 'Chat con agentes',
        release6Description:
            'Control total sobre tus agentes de OpenClaw. Administra y chatea con todo directamente desde el panel.',
        release6Feature3:
            'Chatea con tus agentes desde el playground, interactúa con cualquier agente en tiempo real',
        release6Feature4:
            'Inicia sesión con Google o GitHub, autenticación rápida y segura sin códigos por correo',
        release1Date: '8 de febrero de 2026',
        release1Title: 'Lanzamiento inicial',
        release1Description:
            'El primer lanzamiento oficial de ClawHost. Despliega OpenClaw en tu propio VPS con un solo clic.',
        release1Feature1: 'Despliegue de OpenClaw en un clic',
        release1Feature2:
            'Panel para administrar claws, iniciar, detener, reiniciar y eliminar instancias',
        release1Feature3:
            '18 planes de servidor con vCPU dedicado, RAM y opciones de almacenamiento',
        release1Feature4: '6 ubicaciones de servidor en EE.UU., Europa y Asia',
        release1Feature5:
            'Administración de claves SSH para acceso sin contraseña al servidor',
        release1Feature6:
            'Soporte de almacenamiento de volumen adicional hasta 10 TB',
        release1Feature7:
            'Autenticación con enlace mágico, sin contraseñas necesarias',
        release1Feature8:
            'Acceso en línea a OpenClaw a través de subdominios seguros',
        release1Feature9:
            'Integración de pagos con precios transparentes por servidor',
        release1Feature10:
            'Historial de facturación y administración de facturas',
        release1Feature11:
            'Aprovisionamiento automático con OpenClaw preinstalado y configurado',
        release2Date: '8 de febrero de 2026',
        release2Title: 'Changelog y más',
        release2Description:
            'Una nueva forma de mantenerse informado sobre ClawHost.',
        release2Feature1:
            'Página de historial de cambios para seguir todas las actualizaciones y lanzamientos de la plataforma',
        release3Date: '10 de febrero de 2026',
        release3Title: 'Información del servidor',
        release3Description:
            'Mayor visibilidad y control sobre tus servidores, directamente desde el panel.',
        release3Feature1:
            'Registros del servidor en tiempo real transmitidos directamente en el panel',
        release3Feature2:
            'Diagnósticos del servidor con reparación automática en un clic para problemas de servicio',
        release3Feature3:
            'Explorador de archivos integrado y editor JSON para archivos de configuración del servidor',
        release4Date: '14 de febrero de 2026',
        release4Title: 'Agentes y exportación de datos',
        release4Description:
            'Playground de agentes, administración multi-agente y exportación de datos portable para tus instancias de OpenClaw.',
        release4Feature1:
            'Playground de agentes y resumen en un clic, agrega y administra múltiples agentes',
        release4Feature2: 'Exporta tu OpenClaw como un archivo zip portable',
        release4Feature3:
            'Playground interactivo con visualización de grafo de Claws y agentes',
        release4Feature4:
            'Se eliminó la alternancia entre vista de cuadrícula y lista en favor de un diseño de panel unificado'
    },
    clawDetail: {
        noAgentsYet: 'Sin Agentes',
        noAgentsDescription:
            'Despliega tu primer Agente para interactuar con él.',
        selectClaw: 'Selecciona un Claw',
        selectClawDescription:
            'Elige un Claw de la barra lateral para ver sus detalles.',
        closeDetails: 'Cerrar',
        tabPreview: 'Vista previa',
        previewNotEnabled: 'La vista previa no está habilitada para esta instancia.',
        previewNotEnabledDescription: 'Habilita la vista previa para integrar tu agente directamente en el panel.',
        previewEnable: 'Habilitar vista previa',
        previewEnabling: 'Habilitando...',
        previewEnabled: 'Vista previa habilitada.',
        previewEnableFailed: 'Error al habilitar la vista previa!',
        tabInfo: 'Info',
        tabLogs: 'Registros',
        tabTerminal: 'Terminal',
        terminalConnecting: 'Conectando al terminal...',
        terminalDisconnected: 'Terminal desconectado!',
        terminalError: 'Error al conectar al terminal!',
        terminalReconnect: 'Reconectar',
        tabDisabledConfiguring:
            'Disponible cuando la instancia termine de configurarse.',
        tabDisabledAwaitingPayment:
            'Disponible una vez que se procese el pago.',
        loadingTip1:
            '¿Sabías que puedes ejecutar múltiples agentes dentro de un solo OpenClaw?',
        loadingTip2: '¿Sabías que OpenClaw es de código abierto?',
        loadingTip3:
            'ClawHost es el primer proyecto en permitir hospedaje de OpenClaw con un solo clic.',
        tabSettings: 'Ajustes',
        featureVersionUnsupported: '{{feature}} no compatible con {{version}}',
        featureVersionUnsupportedDescription:
            'No soportamos la gestión de {{feature}} con esta versión a través de nuestra interfaz. Puedes gestionarlo mediante SSH, Terminal o el panel de control de OpenClaw.',
        featureVersionUnsupportedButton: 'Ir a Versiones',
        featureVersionUnsupportedSupported: 'Versiones compatibles:',
        featureVersionUnsupportedNewer: 'versiones más recientes',
        tabVersions: 'Versiones',
        tabFiles: 'Explorador de archivos',
        tabMonitor: 'Monitor',
        tabVolumes: 'Almacenamiento',
        volumesTitle: 'Volúmenes',
        volumesCount: '{{count}} volúmenes',
        volumesEmpty: 'No hay volúmenes adjuntos.',
        volumesEmptyDescription: 'Esta instancia no tiene volúmenes de almacenamiento persistentes.',
        volumesReadOnly: 'El almacenamiento solo se puede agregar durante la creación de la instancia. Para agregar almacenamiento, despliegue una nueva instancia con el tamaño de volumen deseado, o contacte al',
        volumesContactSupport: 'equipo de soporte',
        metricsTitle: 'Métricas del servidor',
        metricsLive: 'En vivo',
        metricsCpu: 'Uso de CPU',
        metricsMemory: 'Uso de memoria',
        metricsDisk: 'Uso de disco',
        metricsNetwork: 'Red',
        metricsLoadAvg: 'Carga promedio',
        metricsProcesses: 'Procesos principales',
        metricsUptime: 'Tiempo de actividad',
        metricsUsed: 'Usado',
        metricsAvailable: 'Disponible',
        metricsTotal: 'Total',
        metricsReceived: 'Recibido',
        metricsSent: 'Enviado',
        metricsLoad1: '1 min',
        metricsLoad5: '5 min',
        metricsLoad15: '15 min',
        metricsProcessPid: 'PID',
        metricsProcessUser: 'Usuario',
        metricsProcessCpu: 'CPU %',
        metricsProcessMem: 'MEM %',
        metricsProcessCommand: 'Comando',
        metricsError: 'Error al cargar las métricas!',
        metricsErrorDescription: 'No se pudo conectar al servidor para obtener las métricas. Por favor, verifique que la instancia esté en ejecución.',
        metricsAutoRefresh: 'Actualización automática cada {{seconds}} segundos',
        tabBilling: 'Billing',
        billingEmpty: 'No billing history for this instance.',
        versionsSearch: 'Buscar versiones...',
        versionsSearchCount: 'Buscar {{count}} versiones...',
        versionsEmpty: 'No se encontraron versiones',
        versionsEmptyDescription: 'Ninguna versión coincide con tu búsqueda.',
        versionsErrorDescription:
            'Error al cargar las versiones. Por favor, verifica tu conexión e inténtalo de nuevo!',
        versionsChangelog: 'Ver changelogs en npm',
        versionCurrent: 'Actual',
        versionLatest: 'Última',
        updateAvailable: 'A newer version of OpenClaw is available',
        updateAvailableDescription: 'A new version of OpenClaw ({{version}}) is available for your instance.',
        goToVersions: 'Go to Versions',
        versionInstall: 'Instalar',
        versionInstalling: 'Instalando...',
        versionInstallSuccess: 'Versión {{version}} instalada con éxito.',
        versionInstallFailed: 'Error al instalar la versión!',
        versionDownloads: '{{count}} descargas',
        versionChangelog: 'Changelog',
        versionOutdated: 'Obsoleto',
        versionSupported: 'Compatible',
        versionSupportedTooltip:
            'Esta versión te permite operar OpenClaw a través de la interfaz',
        versionInstallConfirmTitle: 'Instalar versión {{version}}',
        versionInstallConfirmDescription:
            'Cambiar de versión puede causar un comportamiento inesperado o requerir configuración manual adicional, especialmente para versiones más nuevas que aún no han sido completamente verificadas. ¿Estás seguro de que quieres continuar?',
        settingsName: 'Nombre',
        settingsNamePlaceholder: 'Ingresa el nombre del claw',
        settingsNameDescription: 'Solo letras, números y guiones.',
        subdomain: 'Subdominio',
        subdomainPlaceholder: 'Ingresa el subdominio',
        subdomainDescription:
            'Letras minúsculas y números, {{min}}-{{max}} caracteres.',
        subdomainInvalid:
            'Usa solo {{min}}-{{max}} letras minúsculas y números!',
        subdomainUpdated: 'Subdominio actualizado exitosamente.',
        subdomainUpdateFailed: '¡Error al actualizar el subdominio!',
        subdomainInUse: '¡Este subdominio es usado por otro claw!',
        settingsSave: 'Guardar',
        settingsSaving: 'Guardando...',
        mockLogStarting: 'Starting OpenClaw agent...',
        mockLogLoadingModel: 'Loading model: claude-sonnet-4-5',
        mockLogAgentReady: 'Agent ready on port 3000',
        mockLogConnected: 'Connected to gateway',
        mockLogsContent:
            '2026-02-14T10:23:41Z {{starting}}\n2026-02-14T10:23:42Z {{loadingModel}}\n2026-02-14T10:23:43Z {{agentReady}}\n2026-02-14T10:23:44Z {{connected}}\n2026-02-14T10:24:01Z {{requestReceived}}\n2026-02-14T10:24:03Z {{responseSent1}}\n2026-02-14T10:25:12Z {{requestReceived}}\n2026-02-14T10:25:14Z {{responseSent2}}\n2026-02-14T10:26:30Z {{healthCheck}}',
        mockLogRequestReceived: 'Request received: /chat',
        mockLogResponseSent1: 'Response sent (1.2s)',
        mockLogResponseSent2: 'Response sent (1.8s)',
        mockLogHealthCheck: 'Health check passed'
    },
    privacy: {
        title: 'Política de privacidad',
        description:
            'Conoce cómo ClawHost recopila, usa y protege tus datos personales.',
        lastUpdated: 'Última actualización: 14 de marzo de 2026',
        introTitle: '1. Introducción',
        introText:
            'ClawHost ("nosotros", "nuestro" o "nos") está comprometido a proteger tu privacidad. Esta Política de Privacidad explica cómo recopilamos, usamos, divulgamos y protegemos tu información cuando usas nuestro Servicio.',
        authTitle: '2. Autenticación',
        authText:
            'ClawHost usa Google Firebase Authentication para administrar cuentas de usuario. Puedes iniciar sesión con correo electrónico, Google o GitHub. Al usar estos métodos de inicio de sesión, aceptas sus respectivos términos y políticas de privacidad. Estos proveedores pueden recopilar datos básicos como tu dirección de correo electrónico, nombre e información del dispositivo. Solo almacenamos tu dirección de correo electrónico y nombre para mostrar.',
        collectTitle: '3. Información que recopilamos',
        collectText: 'Recopilamos información de las siguientes maneras:',
        personalInfoTitle: 'Información personal',
        personalInfoEmail:
            'Dirección de correo electrónico (para creación de cuenta y comunicación)',
        personalInfoName: 'Nombre (opcional, para personalización)',
        personalInfoPayment:
            'Información de pago (procesada de forma segura por proveedores externos)',
        serverInfoTitle: 'Información del servidor',
        serverInfoConfig: 'Configuración y estado del servidor',
        serverInfoIp: 'Dirección IP y ubicación del servidor',
        serverInfoResources:
            'Asignación de recursos (CPU, RAM, almacenamiento)',
        useTitle: '4. Cómo usamos tu información',
        useText: 'Usamos la información recopilada para:',
        useProvide: 'Proporcionar y mantener nuestro Servicio',
        useTransactions:
            'Procesar transacciones y enviar información de facturación',
        useNotices: 'Enviar avisos y actualizaciones importantes',
        useSupport: 'Responder a solicitudes de soporte al cliente',
        useAnalyze:
            'Monitorear y analizar patrones de uso para mejorar nuestro Servicio',
        useFraud: 'Detectar y prevenir fraude o abuso',
        sharingTitle: '5. Compartición y divulgación de datos',
        sharingText:
            'No vendemos tu información personal. Podemos compartir información con:',
        sharingProviders:
            'Proveedores de servicio que ayudan a operar nuestro Servicio (ej., proveedores de infraestructura en la nube)',
        sharingLegal:
            'Autoridades legales cuando lo requiera la ley o para proteger nuestros derechos',
        sharingBusiness:
            'Socios comerciales en caso de fusión, adquisición o venta de activos',
        securityTitle: '6. Seguridad de datos',
        securityText:
            'Implementamos medidas técnicas y organizativas apropiadas para proteger tu información personal contra acceso no autorizado, alteración, divulgación o destrucción. Esto incluye cifrado, servidores seguros y evaluaciones de seguridad regulares.',
        retentionTitle: '7. Retención de datos',
        retentionText:
            'Retenemos tu información personal mientras tu cuenta esté activa o sea necesario para proporcionarte servicios. Podemos retener cierta información según lo requiera la ley o para propósitos comerciales legítimos.',
        rightsTitle: '8. Tus derechos',
        rightsText: 'Dependiendo de tu ubicación, puedes tener derecho a:',
        rightsAccess: 'Acceder a tus datos personales',
        rightsCorrect: 'Corregir datos inexactos',
        rightsDelete: 'Solicitar la eliminación de tus datos',
        rightsObject: 'Oponerte al procesamiento de tus datos',
        rightsPortability: 'Portabilidad de datos',
        rightsWithdraw: 'Retirar el consentimiento en cualquier momento',
        cookiesTitle: '9. Cookies y seguimiento',
        cookiesText:
            'No usamos cookies. La autenticación se maneja a través de Firebase y no depende de cookies almacenadas en tu navegador.',
        transfersTitle: '10. Transferencias internacionales de datos',
        transfersText:
            'Tu información puede ser transferida y procesada en países distintos al tuyo. Nos aseguramos de que existan las medidas de protección adecuadas para proteger tus datos de acuerdo con esta Política de Privacidad.',
        eligibilityTitle: '11. Elegibilidad',
        eligibilityText:
            'Nuestro Servicio está disponible para todos. No hay restricciones de edad para usar ClawHost.',
        changesTitle: '12. Cambios a esta política',
        changesText:
            'Podemos actualizar esta Política de Privacidad periódicamente. Te notificaremos de cualquier cambio publicando la nueva Política de Privacidad en esta página y actualizando la fecha de "Última actualización".',
        contactTitle: '13. Contáctanos',
        contactText:
            'Si tienes preguntas sobre esta Política de Privacidad o deseas ejercer tus derechos, por favor contáctanos en'
    },
    terms: {
        title: 'Términos de servicio',
        description:
            'Lee los términos y condiciones para usar los servicios de ClawHost.',
        lastUpdated: 'Última actualización: 14 de marzo de 2026',
        acceptanceTitle: '1. Aceptación de términos',
        acceptanceText:
            'Al acceder y usar ClawHost ("Servicio"), aceptas y te comprometes a cumplir con los términos y disposiciones de este acuerdo. Si no estás de acuerdo con estos términos, por favor no uses nuestro Servicio.',
        serviceTitle: '2. Descripción del servicio',
        serviceText:
            'ClawHost proporciona despliegue de OpenClaw en un clic en servidores dedicados. Permitimos a los usuarios desplegar, administrar y acceder a instancias de OpenClaw preconfiguradas con acceso root completo y recursos dedicados.',
        authTitle: '3. Autenticación',
        authText:
            'ClawHost usa Google Firebase Authentication para administrar el inicio de sesión. Puedes autenticarte con correo electrónico, Google o GitHub. Al usar estos métodos, aceptas los respectivos términos y políticas de privacidad de Google y GitHub. Estos proveedores pueden recopilar información básica como tu dirección de correo electrónico, nombre y datos del dispositivo.',
        responsibilitiesTitle: '4. Responsabilidades del usuario',
        responsibilitiesText: 'Aceptas:',
        responsibilitiesAccurate:
            'Proporcionar información de registro precisa y completa',
        responsibilitiesSecurity:
            'Mantener la seguridad de las credenciales de tu cuenta',
        responsibilitiesCompliance:
            'Usar el Servicio en cumplimiento con todas las leyes aplicables',
        responsibilitiesLegal:
            'No usar el Servicio para ningún propósito ilegal o no autorizado',
        responsibilitiesAccess:
            'No intentar obtener acceso no autorizado a ningún sistema o red',
        prohibitedTitle: '5. Usos prohibidos',
        prohibitedText: 'No puedes usar nuestro Servicio para:',
        prohibitedMalware:
            'Distribuir malware, virus o cualquier software dañino',
        prohibitedDos:
            'Realizar ataques de denegación de servicio o abuso de red',
        prohibitedSpam: 'Enviar spam o comunicaciones no solicitadas',
        prohibitedIllegal: 'Alojar o distribuir contenido ilegal',
        prohibitedIp:
            'Violar derechos de terceros incluyendo propiedad intelectual',
        prohibitedMining: 'Minar criptomonedas',
        prohibitedOther:
            'Cualquier otra actividad ilegal o dañina que determinemos como inapropiada a nuestra discreción',
        paymentTitle: '6. Pagos y facturación',
        paymentText:
            'Los servicios se facturan mensual o anualmente a tarifa fija. Puedes cambiar entre facturación mensual y anual en cualquier momento, y el cambio tomará efecto al inicio de tu próximo período de facturación. Todos los pagos no son reembolsables. Cuando pagas por un servidor, tienes acceso durante todo el período de facturación. Si cancelas, la cancelación toma efecto al final del período de facturación actual. Los precios están sujetos a cambios, pero las modificaciones solo se aplicarán a los nuevos claws desplegados y no afectarán a los ya existentes. El incumplimiento de pago puede resultar en la suspensión o terminación de tu cuenta.',
        availabilityTitle: '7. Disponibilidad del servicio',
        availabilityText:
            'Nos esforzamos por mantener alta disponibilidad pero no garantizamos acceso ininterrumpido al Servicio. Nos reservamos el derecho de modificar, suspender o descontinuar cualquier parte del Servicio en cualquier momento con o sin previo aviso.',
        liabilityTitle: '8. Limitación de responsabilidad',
        liabilityText:
            'En la máxima medida permitida por la ley, ClawHost no será responsable de ningún daño indirecto, incidental, especial, consecuente o punitivo, ni de ninguna pérdida de beneficios o ingresos, ya sea incurrida directa o indirectamente.',
        terminationTitle: '9. Terminación',
        terminationText:
            'Podemos terminar o suspender tu cuenta y acceso al Servicio inmediatamente, sin previo aviso, por conducta que creamos viola estos Términos o es dañina para otros usuarios, para nosotros o para terceros, o por cualquier otra razón.',
        affiliateTitle: '10. Affiliate Program',
        affiliateText:
            'ClawHost offers an affiliate program that allows users to earn rewards by referring new users. By participating in the affiliate program, you agree to the following:',
        affiliateCodeUnique:
            'Each user receives a unique referral code upon registration, which can be customized once.',
        affiliateCodeOneChange:
            'The referral code can only be changed one time. Choose your custom code carefully.',
        affiliateReferralWindow:
            'A referral is valid for 6 months from when the referred user first visits ClawHost with your referral link. After 6 months, the referral expires.',
        affiliateNoSelfReferral:
            'Self-referrals are not permitted. You may not refer your own accounts.',
        affiliateAbuse:
            'Any abuse of the affiliate program, including but not limited to fake accounts, automated signups, or fraudulent referrals, will result in forfeiture of rewards and possible account termination.',
        changesToTermsTitle: '11. Cambios a los términos',
        changesToTermsText:
            'Nos reservamos el derecho de modificar estos términos en cualquier momento. Notificaremos a los usuarios de cualquier cambio material por correo electrónico o a través del Servicio. El uso continuado del Servicio después de dichas modificaciones constituye la aceptación de los términos actualizados.',
        contactTitle: '12. Información de contacto',
        contactText:
            'Si tienes alguna pregunta sobre estos Términos, por favor contáctanos en'
    },
    mobile: {
        messages: 'Mensajes',
        settings: 'Configuración',
        comingSoon: 'Próximamente',
        messagesPlaceholder: 'Los mensajes y notificaciones aparecerán aquí.',
        settingsPlaceholder:
            'La configuración de la cuenta y las preferencias aparecerán aquí.',
        signIn: 'Autenticación',
        signInDescription:
            'Autentícate para gestionar y desplegar tus agentes.',
        enterEmail: 'Correo electrónico',
        emailPlaceholder: 'ejemplo@clawhost.cloud',
        continueWithEmail: 'Continuar con correo',
        otpDescription:
            'Te enviaremos un código para iniciar sesión. Sin contraseña.',
        sending: 'Enviando...',
        checkYourEmail: 'Revisa tu correo',
        codeSentTo: 'Enviamos un código de 6 dígitos a',
        enterCode: 'Ingresa el código de tu correo',
        resendCode: 'Reenviar código',
        resendIn: 'Reenviar en {{seconds}}s',
        changeEmail: 'Cambiar correo',
        invalidCode: 'Código no válido!',
        codeExpired: 'Código expirado. Por favor, solicita uno nuevo!',
        signingIn: 'Autenticando...',
        signOut: 'Cerrar sesión',
        signedInAs: 'Sesión iniciada como',
        loadMore: 'Cargar más',
        deployClaw: 'Desplegar Claw',
        deployYourFirstClaw: 'Despliega tu primer Claw'
    },
    announcement: {
        title: 'Aviso de servicio',
        message:
            'Debido a la alta demanda, el despliegue de agentes no está disponible temporalmente. Los agentes existentes funcionan con normalidad.'
    },
    productHunt: {
        liveOn: 'En vivo en',
        productHunt: 'Product Hunt',
        celebrate: 'Apóyanos y disfruta',
        discount: '10% de descuento',
        yourFirstMonth: 'en tu primer pedido',
        upvoteNow: 'Vótanos'
    },
    compare: {
        title: 'Comparación completa',
        description:
            'Descubre cómo ClawHost se compara con otras plataformas de alojamiento OpenClaw.',
        badge: 'Comparación',
        feature: 'Plataforma',
        compareWith: 'Comparar con',
        lastUpdated: 'Última actualización: marzo 2026',
        competitorClawHost: 'ClawHost',
        competitorLobsterFarm: 'LobsterFarm',
        competitorSimpleClaw: 'SimpleClaw',
        competitorMyClawAi: 'MyClaw.ai',
        competitorQuickClaw: 'QuickClaw',
        categoryInfrastructure: 'Infraestructura',
        categoryPricing: 'Precios & Facturación',
        categoryDeployment: 'Despliegue & Configuración',
        categoryManagement: 'Gestión de OpenClaw',
        categorySecurity: 'Datos & Seguridad',
        categoryMonitoring: 'Monitoreo & Mantenimiento',
        categorySupport: 'Soporte & Plataforma',
        featureServerOwnership: 'Propiedad del servidor',
        featureProviderChoice: 'Elección de proveedor cloud',
        featureDedicatedResources: 'Recursos dedicados',
        featureRootAccess: 'Acceso root/SSH completo',
        featureServerLocations: 'Ubicaciones de servidores',
        featureStartingPrice: 'Precio inicial',
        featureTransparentPricing: 'Precios transparentes',
        featurePowerfulServers: 'Servidores potentes, menor precio',
        featureLocationSelection: 'Seleccionar ubicación del servidor',
        featureSubdomainAccess: 'Acceso por subdominio',
        featureThemes: 'Temas claro y oscuro',
        featureSetupTime: 'Tiempo de configuración',
        featureOneClickDeploy: 'Despliegue con un clic',
        featureMultipleInstances: 'Múltiples instancias',
        featureDataOwnership: 'Propiedad total de datos',
        featureDataExport: 'Exportación de datos',
        featureBackups: 'Copias de seguridad',
        featureSecurityHardening: 'Fortalecimiento de seguridad',
        featureSslTls: 'SSL/TLS',
        featureOpenSource: 'Código abierto',
        featureAutoUpdates: 'Actualizaciones automáticas',
        featureDiagnostics: 'Diagnósticos en tiempo real',
        featureLogStreaming: 'Streaming de registros',
        featureRepairTools: 'Herramientas de reparación',
        featureSupportChannels: 'Canales de soporte',
        featureMultiLanguage: 'Interfaz multilingüe',
        featureMobileApp: 'Aplicación móvil',
        featureDesktopApp: 'Aplicación de escritorio',
        featureOneClickVersion: 'Cambio de versión con un clic',
        featureWebTerminal: 'Terminal web',
        featureSocials: 'Redes sociales',
        dedicatedVps: 'VPS dedicado',
        sharedContainers: 'Contenedores compartidos',
        isolatedContainers: 'Contenedores aislados',
        cloudWorkspaces: 'Espacios de trabajo en la nube',
        threeProviders: 'Cloud',
        singleProvider: 'Proveedor único',
        fullyDedicated: 'Totalmente dedicado',
        shared: 'Compartido',
        fullRootSsh: 'Root + SSH completo',
        sshOnRequest: 'SSH bajo petición',
        noAccess: 'Sin acceso',
        thirtyPlusLocations: '30+ ubicaciones',
        limitedLocations: 'Limitado',
        fourLocations: '4 ubicaciones',
        fromTwentyFiveMonth: 'Desde $25/mes',
        aboutFortyFourMonth: '~$44/mes promedio',
        fromNineteenMonth: '$19–79/mes',
        nineteenMonth: '$19/mes',
        clearSpecsPricing: 'Especificaciones y precios claros',
        unclearPricing: 'Precios poco claros',
        fixedTiers: '3 niveles fijos',
        creditBased: 'Basado en créditos',
        minutes: 'Minutos',
        underOneMinute: 'Menos de 1 minuto',
        thirtySeconds: '30 segundos',
        instant: 'Instantáneo',
        noneRequired: 'Ninguna',
        minimal: 'Mínima',
        unlimited: 'Ilimitadas',
        singleInstance: 'Única',
        noMarketplace: 'Sin marketplace',
        appOnly: 'Solo aplicación',
        fullConfig: 'Configuración completa',
        limitedConfig: 'Limitada',
        zipExport: 'Exportación ZIP',
        serverTransfer: 'Transferencia de servidor',
        noExport: 'Sin exportación',
        volumeStorage: 'Almacenamiento en volúmenes',
        noBackups: 'Sin copias de seguridad',
        dailyBackups: 'Copias de seguridad diarias',
        included: 'Incluido',
        notIncluded: 'No incluido',
        managed: 'Gestionado',
        manual: 'Manual',
        appStore: 'App Store',
        liveMonitoring: 'Monitoreo en vivo',
        liveLogs: 'Registros en vivo',
        oneClickRepair: 'Reparación con un clic',
        emailGithub: 'Email, GitHub',
        humanSupport: 'Soporte humano',
        communityOnly: 'Solo comunidad',
        appSupport: 'Soporte vía aplicación',
        prioritySupport: 'Soporte 24/7 (Pro+)',
        fourLanguages: '4 idiomas',
        englishOnly: 'Solo inglés',
        available: 'Disponible',
        comingSoon: 'Próximamente',
        iosMacOs: 'iOS & macOS',
        macOsOnly: 'Solo macOS',
        viaTelegram: 'Vía Telegram',
        builtInTerminal: 'Sin SSH',
        notAvailable: 'No disponible',
        disclaimer: '¿Algo cambió o es incorrecto? Escríbenos a',
        disclaimerOr: 'o abre un pull request en',
        github: 'GitHub',
        ctaTitle: '¿Listo para ver la diferencia?',
        ctaDescription:
            'Despliega OpenClaw en tu propio servidor dedicado. Propiedad total, precios transparentes y listo en minutos.'
    },
    admin: {
        title: 'Admin',
        description: 'Gestiona los usuarios y datos de tu plataforma.',
        usersTab: 'Usuarios',
        totalUsers: '{{count}} usuarios',
        noUsers: 'Sin usuarios',
        noUsersDescription:
            'No se encontraron usuarios que coincidan con tus filtros.',
        genericErrorDescription:
            'Algo salió mal. Por favor, inténtalo de nuevo.',
        genericEmptyDescription: 'Nada que mostrar aquí todavía.',
        failedToLoadUsers: 'Error al cargar los usuarios!',
        failedToLoadUsersDescription:
            'Algo salió mal al cargar los usuarios. Por favor, inténtalo de nuevo.',
        failedToLoadUserDetail: 'Error al cargar los detalles del usuario!',
        userDetail: 'Detalles del usuario',
        userInfo: 'Info del usuario',
        email: 'Correo',
        name: 'Nombre',
        role: 'Rol',
        authMethods: 'Métodos de autenticación',
        license: 'Licencia',
        referralCode: 'Código de referido',
        referredBy: 'Referido por',
        joined: 'Registrado',
        claws: 'Claws',
        sshKeys: 'Claves SSH',
        volumes: 'Volúmenes',
        billing: 'Facturación',
        noClaws: 'Sin Claws',
        noSshKeys: 'Sin Claves SSH',
        noVolumes: 'Sin Volúmenes',
        noBilling: 'Sin Historial de Facturación',
        hasLicense: 'Sí',
        noLicense: 'No',
        notSet: 'No definido',
        searchPlaceholder: 'Buscar por correo o nombre...',
        filterAll: 'Todos los usuarios',
        filterWithClaws: 'Con claws',
        filterWithoutClaws: 'Sin claws',
        sortNewest: 'Más recientes',
        sortOldest: 'Más antiguos',
        editUser: 'Editar',
        saveUser: 'Guardar',
        userUpdated: 'Usuario actualizado.',
        userUpdateFailed: 'Error al actualizar!',
        clawsTab: 'Claws',
        sshKeysTab: 'Claves SSH',
        volumesTab: 'Volúmenes',
        noClawsFound: 'Sin Claws',
        noSSHKeysFound: 'Sin Claves SSH',
        noVolumesFound: 'Sin Volúmenes',
        failedToLoadAgents: 'Error al cargar los agents!',
        failedToLoadSSHKeys: 'Error al cargar las claves SSH!',
        failedToLoadVolumes: 'Error al cargar los volúmenes!',
        owner: 'Propietario',
        searchClaws: 'Buscar claws...',
        searchSSHKeys: 'Buscar claves SSH...',
        referralsTab: 'Referidos',
        pendingClawsTab: 'Pendientes',
        waitlistTab: 'Lista de espera',
        emailsTab: 'Correos',
        analyticsTab: 'Análisis',
        billingTab: 'Facturación',
        settingsTab: 'Configuración',
        settingsDescription: 'Administra tus preferencias de administrador.',
        showAllAgents: 'Mostrar todos los agentes de todos los usuarios',
        billingFilterAll: 'Todos los pedidos',
        billingFilterService: 'Servicio Claw',
        billingFilterLicense: 'Licencia',
        billingOrderTypeLabel: ' · {{type}}',
        noBillingFound: 'Sin pedidos',
        failedToLoadBilling: '¡Error al cargar pedidos!',
        searchBilling: 'Buscar por producto...',
        billingReason: 'Razón',
        billingType: 'Tipo',
        billingSubtotal: 'Subtotal',
        billingDiscount: 'Descuento',
        billingTax: 'Impuesto',
        billingTotal: 'Total',
        analyticsDay: 'Día',
        analyticsWeek: 'Semana',
        analyticsMonth: 'Mes',
        analyticsYear: 'Año',
        analyticsAllTime: 'Todo el tiempo',
        analyticsFilter: 'Filtrar',
        analyticsResources: 'Recursos',
        analyticsSelectAll: 'Seleccionar todo',
        analyticsDeselectAll: 'Deseleccionar todo',
        failedToLoadAnalytics: '¡Error al cargar análisis!',
        noAnalyticsData: 'No hay datos de análisis disponibles.',
        noReferralsFound: 'Sin Referidos',
        noPendingClawsFound: 'Sin Claws Pendientes',
        noWaitlistFound: 'Sin Lista de Espera',
        noEmailsFound: 'Sin Correos',
        failedToLoadReferrals: 'Error al cargar los referidos!',
        failedToLoadPendingClaws: 'Error al cargar los claws pendientes!',
        failedToLoadWaitlist: 'Error al cargar la lista de espera!',
        failedToLoadEmails: 'Error al cargar los correos!',
        referrer: 'Referente',
        referred: 'Referido',
        earned: 'Ganado',
        searchWaitlist: 'Buscar en lista de espera...',
        expiresAt: 'Expira',
        feature: 'Característica',
        sentAt: 'Enviado',
        fileSize: 'Tamaño',
        registered: 'Registrado',
        status: 'Estado',
        ip: 'IP',
        plan: 'Plan',
        location: 'Ubicación',
        subdomain: 'Subdominio',
        subscription: 'Suscripción',
        billingInterval: 'Facturación',
        deletionScheduled: 'Eliminación programada',
        fingerprint: 'Huella digital',
        price: 'Precio',
        pricePerMonth: '{{price}}/mes',
        statusRunning: 'En ejecución',
        statusStopped: 'Detenido',
        adminBadge: 'Admin',
        unitGB: '{{size}} GB',
        unitKB: '{{size}} KB'
    },
    affiliate: {
        title: 'Afiliado',
        description: 'Gana recompensas refiriendo amigos a ClawHost.',
        subtitle: 'Comparte tu enlace de referido y gana recompensas.',
        learnMore: 'Más información sobre el programa de afiliados',
        referralCode: 'Código de referido',
        referrals: 'Referidos',
        payments: 'pagos',
        earnings: 'Ganancias',
        codeChangeHint:
            'Puedes personalizar tu código de referido una sola vez.',
        codeAlreadyChanged: 'Tu código de referido ya ha sido personalizado.',
        codeUpdated: 'Código de referido actualizado.',
        codeUpdateFailed: 'Error al actualizar el código de referido!',
        invalidCodeLength:
            'El código debe tener entre {{min}} y {{max}} caracteres!',
        referralHistory: 'Historial de referidos',
        paymentHistory: 'Historial de pagos',
        periodToday: 'Hoy',
        periodWeek: 'Semana',
        periodMonth: 'Mes',
        periodYear: 'Año',
        periodAll: 'Todo',
        confirmChangeTitle: 'Cambiar código de referido',
        confirmChangeDescription:
            '¿Estás seguro? Esta acción es permanente e irreversible. No podrás cambiar tu código de referido de nuevo.',
        noReferralsYet: 'Sin referidos',
        noReferralsDescription:
            'Comparte tu enlace de referido para empezar a ganar recompensas.',
        noPaymentsYet: 'Sin pagos',
        noPaymentsDescription:
            'Cuando tus usuarios referidos realicen compras, sus pagos aparecerán aquí.'
    },
    affiliateProgram: {
        title: 'Programa de afiliados',
        description:
            'Descubre cómo funciona el programa de afiliados de ClawHost, cuánto puedes ganar y las reglas de participación.',
        lastUpdated: 'Última actualización: 1 de abril de 2026',
        overviewTitle: '1. Descripción general',
        overviewText:
            'El programa de afiliados de ClawHost te permite ganar recompensas al recomendar nuevos usuarios a ClawHost. Cuando alguien realiza una compra después de visitar ClawHost a través de tu enlace de referido, ganas una comisión sobre sus pagos. El programa es gratuito y está disponible para todos los usuarios registrados de ClawHost.',
        howItWorksTitle: '2. Cómo funciona',
        howItWorksText: 'Comenzar con el programa de afiliados es sencillo:',
        howItWorksStep1:
            'Regístrate en una cuenta de ClawHost. Se genera automáticamente un código de referido único para ti.',
        howItWorksStep2:
            'Comparte tu enlace de referido con amigos, colegas o tu audiencia. Tu enlace sigue el formato: clawhost.cloud?ref=YOUR_CODE.',
        howItWorksStep3:
            'Cuando alguien realiza una compra después de visitar ClawHost a través de tu enlace, queda registrado como tu referido.',
        howItWorksStep4:
            'Ganas una comisión cada vez que tu referido realiza una compra elegible.',
        earningsTitle: '3. Ganancias y pagos',
        earningsText: 'Así funcionan las ganancias de afiliados:',
        earningsCommission:
            'Ganas una comisión del 15% en cada compra elegible realizada por tus referidos. Las comisiones aplican tanto a los planes ClawHost Cloud como ClawHost Go.',
        earningsMonthly:
            'Para suscripciones mensuales, ganas comisiones durante 1 año desde la fecha de la referencia.',
        earningsYearly:
            'Para suscripciones anuales, ganas una comisión solo sobre el primer año.',
        earningsPayout:
            'El monto mínimo de retiro es de $100 USD. Para solicitar un retiro, contacta a nuestro equipo de soporte.',
        earningsPaymentMethod:
            'Los retiros se procesan a través de PayPal. Debes proporcionar una dirección de correo electrónico de PayPal válida al solicitar un pago.',
        earningsCurrency: 'Todas las ganancias se calculan y muestran en USD.',
        referralCodeTitle: '4. Tu código de referido',
        referralCodeText:
            'Cada usuario recibe un código de referido único al registrarse. Puedes personalizarlo una vez para hacerlo más memorable:',
        referralCodeUnique:
            'Tu código de referido es único para tu cuenta y no puede ser compartido ni transferido a otro usuario.',
        referralCodeOneChange:
            'Puedes personalizar tu código de referido exactamente una vez. Elige con cuidado — este cambio es permanente e irreversible.',
        referralCodeFormat:
            'Los códigos de referido solo pueden contener letras, números, guiones y guiones bajos.',
        referralWindowTitle: '5. Ventana de atribución de referidos',
        referralWindowText:
            'Un referido se te atribuye durante 3 meses desde el momento en que el usuario referido visita ClawHost por primera vez a través de tu enlace. Si el usuario referido no realiza una compra dentro de esta ventana de 3 meses, el referido expira y no se ganará ninguna comisión. Si el usuario visita a través de un enlace de referido diferente, el nuevo referido reemplaza al anterior.',
        eligibilityTitle: '6. Elegibilidad',
        eligibilityText:
            'Para participar en el programa de afiliados, debes cumplir los siguientes requisitos:',
        eligibilityAccount: 'Debes tener una cuenta registrada en ClawHost.',
        eligibilityStanding:
            'Tu cuenta debe estar en buen estado sin historial de violaciones de políticas.',
        eligibilityAge:
            'Debes tener al menos 18 años o la mayoría de edad en tu jurisdicción.',
        rulesTitle: '7. Reglas del programa',
        rulesText:
            'Para mantener la integridad del programa de afiliados, se aplican las siguientes reglas:',
        rulesNoSelfReferral:
            'Las auto-referencias están estrictamente prohibidas. No puedes referir tus propias cuentas o cuentas que controles.',
        rulesNoFakeAccounts:
            'La creación de cuentas falsas, registros automatizados o el uso de bots para generar referidos está prohibida.',
        rulesNoSpam:
            'El envío de mensajes masivos no solicitados (spam) para promocionar tu enlace de referido no está permitido.',
        rulesNoMisrepresentation:
            'No puedes tergiversar ClawHost, sus servicios o el programa de afiliados de ninguna manera.',
        rulesNoIncentivized:
            'Ofrecer incentivos monetarios directos (por ejemplo, pagar a usuarios para que se registren a través de tu enlace) no está permitido.',
        terminationTitle: '8. Violación y terminación',
        terminationText:
            'Cualquier violación de estas reglas resultará en la pérdida inmediata de todas las recompensas pendientes y ganadas. ClawHost se reserva el derecho de suspender o prohibir permanentemente tu cuenta del programa de afiliados. En casos graves, tu cuenta de ClawHost también puede ser cancelada. Todas las decisiones sobre violaciones son definitivas.',
        marketingTitle: '9. Cómo promocionar',
        marketingText:
            'Hay muchas formas creativas y legítimas de compartir tu enlace de referido y aumentar tus ganancias:',
        marketingSocial:
            'Comparte tu enlace en plataformas de redes sociales como X, LinkedIn, Reddit y Facebook. Escribe sobre tu experiencia con ClawHost e incluye tu enlace de referido.',
        marketingBlog:
            'Escribe publicaciones de blog, tutoriales o reseñas sobre ClawHost. Incluye tu enlace de referido de forma natural dentro del contenido.',
        marketingVideo:
            'Crea contenido de video en YouTube o TikTok mostrando cómo usas ClawHost para desplegar y gestionar agentes de IA.',
        marketingCommunity:
            'Participa en comunidades de desarrolladores, foros y servidores de Discord. Cuando alguien pregunte sobre alojamiento en la nube o despliegue de agentes de IA, recomienda ClawHost con tu enlace.',
        marketingNewsletter:
            'Si tienes un boletín informativo o lista de correo, menciona ClawHost en un número relevante con tu enlace de referido.',
        marketingComparison:
            'Escribe artículos de comparación honestos o guías que destaquen lo que hace diferente a ClawHost de otras plataformas.',
        changesToProgramTitle: '10. Cambios en el programa',
        changesToProgramText:
            'ClawHost se reserva el derecho de modificar, suspender o discontinuar el programa de afiliados en cualquier momento sin previo aviso. Esto incluye cambios en las tasas de comisión, ventanas de referido, umbrales de pago y reglas del programa. La participación continuada después de los cambios constituye la aceptación de los términos actualizados.',
        getStartedTitle: '11. Comenzar',
        getStartedText:
            '¿Listo para empezar a ganar? Dirígete a tu panel de afiliados para obtener tu enlace de referido y comienza a compartirlo con tu red.',
        getStartedButton: 'Ir al panel de afiliados',
        contactTitle: '12. Contacto',
        contactText:
            'Si tienes preguntas sobre el programa de afiliados, necesitas ayuda con tu código de referido o deseas reportar una violación, contáctanos en'
    }
}

export default es