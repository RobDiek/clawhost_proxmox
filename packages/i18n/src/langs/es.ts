import type { Translations } from '../types'

const es: Translations = {
    common: {
        loading: 'Cargando...',
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
        menuFile: 'Archivo',
        menuEdit: 'Editar',
        menuView: 'Visualización',
        menuWindow: 'Ventana',
        menuHelp: 'Ayuda',
        legalEmail: 'legal@clawhost.cloud',
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
        playground: 'Playground',
        sshKeys: 'Claves SSH',
        account: 'Cuenta',
        billing: 'Facturación',
        license: 'Licencia',
        signOut: 'Cerrar sesión',
        admin: 'Admin',
        login: 'Acceder',
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
        description: 'Un cliente de escritorio ligero para gestionar tus instancias de OpenClaw. Despliega, monitorea y controla tus claws — directamente desde tu máquina.',
        download: 'Descargar para {{os}}',
        downloadWindows: 'Windows',
        downloadMac: 'macOS',
        selfHostInstead: 'Auto-alojar en su lugar',
        features: 'Características',
        whyClawHostGo: 'Todas las funciones',
        featuresDescription: 'Por qué vale la pena probarnos, las características no mienten.',
        zeroConfigDescription: 'Instala y ejecuta. Sin configuración de servidor ni nube. OpenClaw está listo en segundos.',
        ownedDataDescription: 'Todo se ejecuta en tu dispositivo. Sin servidores en la nube, sin terceros, sin datos saliendo de tu máquina.',
        terminalAccessDescription: 'Accede al terminal de tu instancia OpenClaw directamente desde la aplicación. Sin clientes SSH externos.',
        simplePricing: 'Precios simples',
        simplePricingDescription: 'Una licencia, todo ilimitado. Sin facturas mensuales, sin límites de uso, sin cargos ocultos.',
        localDomain: 'Dominio local personalizado',
        localDomainDescription: 'Accede a tu OpenClaw a través de un dominio local personalizado. URLs limpias en tu propia red.',
        secureDescription: 'Tus datos nunca salen de tu dispositivo. Completamente aislado, completamente cifrado, completamente tuyo.',
        pricing: 'Precios',
        pricingTitle: 'Precio único y simple',
        pricingDescription: 'Sin suscripciones, sin tarifas ocultas. Una licencia, uso ilimitado.',
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
        comparisonDescription: 'Elige lo que te funcione. Go se ejecuta localmente, Cloud en servidores dedicados.',
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
        comparisonAgentsUs: 'Múltiples agentes',
        comparisonAgentsOthers: 'Múltiples agentes',
        faqTitle: 'Preguntas',
        faqHeading: 'Preguntas frecuentes',
        faqDescription: 'Todo lo que necesitas saber sobre ClawHost Go.',
        faq1Question: '¿Qué es ClawHost Go?',
        faq1Answer: 'ClawHost Go es una aplicación de escritorio ligera que te permite ejecutar OpenClaw localmente en tu máquina. Sin servidores en la nube — instala, ejecuta y comienza a usar OpenClaw en segundos.',
        faq2Question: '¿En qué se diferencia Go de ClawHost Cloud?',
        faq2Answer: 'ClawHost Cloud despliega OpenClaw en servidores remotos dedicados con disponibilidad 24/7 y acceso global. ClawHost Go ejecuta todo localmente en tu dispositivo — ideal para privacidad, uso sin conexión y configuraciones simples.',
        faq3Question: '¿Necesito conexión a internet?',
        faq3Answer: 'ClawHost Go funciona sin conexión para uso local. Solo se necesita conexión a internet para la configuración inicial, actualizaciones y funciones que requieran llamadas API externas.',
        faq4Question: '¿La licencia es un pago único?',
        faq4Answer: 'Sí. Pagas una vez y obtienes acceso de por vida a ClawHost Go, incluyendo todas las actualizaciones futuras. Sin suscripciones, sin cargos recurrentes.',
        faq5Question: '¿Qué sistemas operativos son compatibles?',
        faq5Answer: 'ClawHost Go es compatible con Windows y macOS. Ambas plataformas tienen las mismas funciones y reciben actualizaciones simultáneamente.',
        faq6Question: '¿Puedo cambiar de Go a Cloud después?',
        faq6Answer: 'Por supuesto. Puedes exportar tu configuración de OpenClaw desde Go y desplegarla en ClawHost Cloud en cualquier momento. Ambas plataformas son completamente compatibles.',
        statsPrice: '${{price}}',
        statsLifetime: 'De por vida',
        statsOneTime: 'Único',
        statsPayment: 'Pago',
        statsLocal: 'Local',
        statsLocally: 'Se ejecuta localmente',
        statsZero: 'Cero',
        statsZeroConfig: 'Cero configuración',
        ctaTitle: 'Ejecuta OpenClaw localmente',
        ctaDescription: 'Pago único, licencia de por vida. Despliega OpenClaw en tu propia máquina — sin cloud, sin suscripciones, sin límites. Tus datos, tus reglas.',
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
        invalidClawName: '¡Nombre de claw inválido. Usa solo letras, números y guiones!',
        clawNameAlreadyExists: '¡Ya existe un claw con este nombre!',
        invalidSubdomain: '¡Subdominio inválido. Usa de 3 a 20 letras minúsculas y números!',
        subdomainAlreadyInUse: '¡Este subdominio ya está en uso!',
        clawDirectoryNotFound: '¡Directorio del claw no encontrado!',
        noVersionInstalled: '¡No hay ninguna versión de OpenClaw instalada. Ve a la pestaña Versiones e instala una primero!',
        failedToStartClaw: '¡Error al iniciar el claw!',
        noVersionAssigned: '¡No hay ninguna versión de OpenClaw asignada a este claw!',
        invalidAgentName: '¡Nombre de agente inválido!',
        agentNameAlreadyExists: '¡Ya existe un agente con este nombre!',
        invalidPath: '¡Ruta inválida!',
        fileNotFound: '¡Archivo no encontrado!',
        purchasingNotAvailable: '¡La compra no está disponible en modo local!',
        exportFailed: '¡Error al exportar!',
        versionNotInstalled: '¡La versión {{version}} de OpenClaw no está instalada!',
        failedToStartProcess: '¡Error al iniciar el proceso: {{reason}}!',
        processExitedImmediately: 'El proceso terminó inmediatamente. Logs:\n{{logs}}',
        processExitedImmediatelyNoLogs: '¡El proceso terminó inmediatamente después de iniciar!',
        processExitedWithCode: 'El proceso terminó con el código {{code}}. Logs:\n{{logs}}',
        processExitedWithCodeNoLogs: '¡El proceso terminó con el código {{code}}!',
        processExitedUnexpectedly: '¡El proceso terminó inesperadamente!',
        failedToInstallVersion: '¡Error al instalar OpenClaw {{version}}: {{reason}}!',
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
        failedToLoadClaws: 'Error al cargar los claws!',
        failedToLoadClawsDescription:
            'No pudimos cargar tus Claws. Por favor, verifica tu conexión e intenta de nuevo.',
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
        invalidEnvVars: 'Nombres o valores de variables de entorno no válidos!',
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
        providerNotAllowed:
            'Este proveedor no está disponible cuando Hetzner está activo!',
        invalidPlan: 'Plan seleccionado no válido!',
        planBelowMinimumMemory:
            'Este plan no cumple con el requisito mínimo de memoria!',
        invalidLocation: 'Ubicación seleccionada no válida!',
        planNotAvailableAtLocation: 'Este plan no está disponible en la ubicación seleccionada!',
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
        failedToRepairClaw: 'Error al reparar la instancia!',
        repairSuccess: 'Instancia reparada exitosamente.',
        repairGatewayNotResponding:
            'Reparación aplicada pero el gateway aún no responde. Puede necesitar más tiempo para iniciar!',
        failedToReinstallClaw: 'Error al reinstalar la instancia!',
        reinstallSuccess: 'Instancia reinstalada exitosamente.',
        reinstallRateLimited:
            'Solo puedes reinstalar una vez cada 24 horas. Contacta al equipo si deseas eliminar este límite.',
        clawBusy: 'El claw está siendo aprovisionado o eliminado!',
        reinstallGatewayNotResponding:
            'Reinstalación completada pero el gateway aún no responde. Puede necesitar más tiempo para iniciar!',
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
        agentsFetched: 'Agentes obtenidos exitosamente.',
        agentsFetchFailed:
            'No se pudo conectar con la instancia para obtener los agentes!',
        agentConfigFetched: 'Configuración del agente obtenida exitosamente.',
        agentConfigUpdated:
            'Configuración del agente actualizada exitosamente.',
        agentConfigUpdateFailed:
            'No se pudo actualizar la configuración del agente!',
        agentCreated: 'Agente creado exitosamente.',
        agentCreateFailed: 'No se pudo crear el agente en la instancia!',
        agentDeleted: 'Agente eliminado exitosamente.',
        agentDeleteFailed: 'No se pudo eliminar el agente de la instancia!',
        cannotDeleteMainAgent: 'No se puede eliminar el único agente restante!',
        agentNameInvalid:
            'El nombre del agente solo puede contener letras, números y guiones!',
        agentNameDuplicate: 'Ya existe un agente con este nombre!',
        diagnosticsFetched: 'Diagnósticos obtenidos exitosamente.',
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
        channelsFetched: 'Canales obtenidos exitosamente.',
        channelsUpdated: 'Canales actualizados exitosamente.',
        channelsUpdateFailed: 'No se pudieron actualizar los canales!',
        channelsFetchFailed: 'No se pudieron obtener los canales!',
        channelMissingRequired:
            'Faltan campos obligatorios para el canal habilitado!',
        whatsappPairStarted: 'Emparejamiento de WhatsApp iniciado.',
        whatsappPairFailed: 'Error al emparejar WhatsApp!',
        whatsappAlreadyPaired: 'WhatsApp ya está emparejado!',
        whatsappVersionUnsupported: 'Esta versión no admite la configuración de canales desde el panel. Usa la pestaña Terminal para configurar manualmente o actualiza OpenClaw.',
        bindingsFetched: 'Vinculaciones obtenidas exitosamente.',
        bindingsFetchFailed: 'No se pudieron obtener las vinculaciones!',
        bindingsUpdated: 'Vinculaciones actualizadas exitosamente.',
        bindingsUpdateFailed: 'No se pudieron actualizar las vinculaciones!',
        bindingsInvalidFormat: 'Formato de vinculación inválido!',
        bindingsInvalidChannel: 'Canal no soportado en la vinculación!',
        bindingsDuplicateChannel:
            'Un canal solo puede estar vinculado a un agente!',
        skillsFetched: 'Habilidades obtenidas exitosamente.',
        skillsUpdated: 'Habilidades actualizadas exitosamente.',
        skillsUpdateFailed: 'No se pudieron actualizar las habilidades!',
        skillsFetchFailed: 'No se pudieron obtener las habilidades!',
        agentSkillsFetched: 'Habilidades del agente obtenidas exitosamente.',
        agentSkillsUpdated: 'Habilidades del agente actualizadas exitosamente.',
        agentSkillsUpdateFailed:
            'No se pudieron actualizar las habilidades del agente!',
        agentSkillsFetchFailed:
            'No se pudieron obtener las habilidades del agente!',
        invalidSkillName:
            'El nombre de la habilidad solo puede contener letras, números, guiones y guiones bajos!',
        skillNotFound: 'Habilidad no encontrada!',
        clawHubSearchSuccess: 'Búsqueda en ClawHub completada.',
        clawHubSearchFailed: 'No se pudo buscar en ClawHub!',
        clawHubFetched: 'Habilidades de ClawHub obtenidas.',
        clawHubFetchFailed:
            'No se pudieron obtener las habilidades de ClawHub!',
        clawHubInstalled: 'Habilidad instalada desde ClawHub.',
        clawHubInstallFailed: 'No se pudo instalar la habilidad desde ClawHub!',
        clawHubRemoved: 'Habilidad de ClawHub eliminada.',
        clawHubRemoveFailed: 'No se pudo eliminar la habilidad de ClawHub!',
        clawHubUpdated: 'Habilidad actualizada.',
        clawHubUpdateFailed: 'No se pudo actualizar la habilidad de ClawHub!',
        clawHubUpdatesFetched: 'Verificación de actualizaciones completada.',
        clawHubUpdatesFailed: 'No se pudieron verificar las actualizaciones!',
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
        voiceNotFound: 'Modelo de voz no encontrado!',
        ttsGenerationFailed: 'Error al generar el habla!',
        voicesFetched: 'Voces obtenidas exitosamente.',
        featureEmailsSent: 'Emails de funcionalidades enviados exitosamente.',
        featureEmailsFailed: '¡Error al enviar los emails de funcionalidades!',
        invalidFeatureKey: '¡Clave de funcionalidad inválida!',
        waitlistJoined: 'Te has unido a la lista de espera.',
        waitlistAlreadyJoined: 'Ya estás en la lista de espera.',
        waitlistJoinFailed: '¡Error al unirse a la lista de espera!',
        waitlistRateLimited: '¡Vas demasiado rápido! Por favor, inténtalo de nuevo en {{seconds}} {{unit}}.',
        waitlistStatusFetched: 'Estado de la lista de espera obtenido.',
        waitlistCheckFailed: '¡Error al verificar el estado de la lista de espera!'
    },
    emails: {
        otpSubject: 'Tu código de inicio de sesión de ClawHost',
        otpPreview: 'Tu código de inicio de sesión de ClawHost: {{code}}',
        otpHeading: 'Tu código de inicio de sesión es:',
        otpExpiry:
            'El código expira en 10 minutos. Si no fuiste tú, ignora este correo.',
        changelogSubject: 'Novedades en ClawHost',
        changelogPreview:
            'Descubre las últimas actualizaciones de ClawHost: {{title}}',
        changelogHeading: 'Novedades',
        changelogButton: 'Ver changelog',
        changelogVisitButton: 'Visitar ClawHost',
        changelogFooter:
            'Recibes este correo porque tienes una cuenta en ClawHost.',
        featureFooter:
            'Recibes este correo porque tienes una cuenta en ClawHost.',
        features: {
            terminal: {
                subject: '¿Lo sabías? Tienes un terminal web',
                preview: 'Accede a tu servidor directamente desde el navegador',
                heading: 'Tu servidor está a un clic',
                description:
                    'Accede a tu servidor directamente desde tu navegador con nuestro terminal integrado. No necesitas un cliente SSH — abre ClawHost y empieza a escribir comandos.',
                cta: 'Abrir terminal'
            },
            logs: {
                subject: '¿Lo sabías? Logs en tiempo real en tu panel',
                preview: 'Monitoriza los logs de tu servidor sin salir del navegador',
                heading: 'Ve lo que hace tu servidor',
                description:
                    'Monitoriza los logs de tu servidor en tiempo real desde el panel de ClawHost. Diagnostica problemas, rastrea despliegues y depura tus aplicaciones sin salir del navegador.',
                cta: 'Ver logs'
            },
            channels: {
                subject: '¿Lo sabías? Conecta agentes a Discord, Slack y más',
                preview: 'Vincula tus agentes de IA a canales de comunicación',
                heading: 'Tus agentes, en todas partes',
                description:
                    'Conecta tus agentes de IA a Discord, Slack, WhatsApp y más. Configura canales y vincúlalos a tus agentes — todo desde el panel de ClawHost.',
                cta: 'Configurar canales'
            },
            fileExplorer: {
                subject: '¿Lo sabías? Edita archivos del servidor desde el navegador',
                preview: 'Explora, lee y edita archivos sin SSH',
                heading: 'Tus archivos, al alcance',
                description:
                    'Explora, lee y edita los archivos de tu servidor directamente desde el panel de ClawHost. Resaltado de sintaxis, búsqueda y guardado instantáneo — sin SSH.',
                cta: 'Abrir explorador'
            },
            playground: {
                subject: '¿Lo sabías? Visualiza tu infraestructura',
                preview: 'Ve tus claws y agentes en un canvas interactivo',
                heading: 'Ve el panorama completo',
                description:
                    'El Playground te ofrece un canvas interactivo con todos tus claws y agentes. Haz clic en cualquier nodo para gestionarlo — un centro de control visual para tu infraestructura.',
                cta: 'Abrir Playground'
            },
            agentChat: {
                subject: '¿Lo sabías? Chatea con tus agentes de IA',
                preview: 'Habla con tus agentes directamente desde el panel',
                heading: 'Habla con tus agentes',
                description:
                    'Chatea con tus agentes de IA directamente desde el panel de ClawHost. Envía mensajes, adjunta imágenes y consulta el historial — todo en un solo lugar.',
                cta: 'Empezar a chatear'
            },
            voiceMode: {
                subject: '¿Lo sabías? Habla con tus agentes por voz',
                preview: 'Usa reconocimiento de voz con tus agentes',
                heading: 'Habla, no escribas',
                description:
                    'Usa el modo de voz para hablar con tus agentes de IA sin manos. Reconocimiento de voz para entrada, síntesis de voz para respuestas — con varias voces disponibles.',
                cta: 'Probar modo de voz'
            },
            skills: {
                subject: '¿Lo sabías? Más de 5.000 skills en ClawHub',
                preview: 'Explora e instala skills de la comunidad con un clic',
                heading: 'Amplía tus agentes al instante',
                description:
                    'Explora más de 5.000 skills listos para usar en ClawHub e instálalos con un solo clic. Búsqueda web, ejecución de código, generación de imágenes y mucho más.',
                cta: 'Explorar ClawHub'
            },
            bindings: {
                subject: '¿Lo sabías? Vincula agentes a canales específicos',
                preview: 'Controla qué agente responde en qué canal',
                heading: 'Un agente por canal',
                description:
                    'Vincula agentes específicos a canales específicos. Tu agente de soporte en Discord, tu asistente en WhatsApp — tú decides quién responde dónde.',
                cta: 'Configurar vínculos'
            },
            envVars: {
                subject: '¿Lo sabías? Gestiona variables de entorno',
                preview: 'Configura claves API y ajustes sin SSH',
                heading: 'Configura sin SSH',
                description:
                    'Añade, edita y elimina variables de entorno directamente desde el panel de ClawHost. Claves API, secretos y configuración — sin terminal.',
                cta: 'Gestionar variables'
            },
            diagnostics: {
                subject: '¿Lo sabías? Diagnósticos integrados',
                preview: 'Monitoriza la salud de tu servidor desde el panel',
                heading: 'Verifica la salud de tu servidor',
                description:
                    'Ejecuta diagnósticos en tu claw para verificar el estado de los servicios, uso de memoria y disponibilidad de puertos. Detecta problemas antes de que se agraven.',
                cta: 'Ejecutar diagnósticos'
            },
            sshKeys: {
                subject: '¿Lo sabías? Gestiona claves SSH desde ClawHost',
                preview: 'Genera y gestiona pares de claves SSH en el panel',
                heading: 'Claves SSH, simplificadas',
                description:
                    'Genera pares de claves SSH, copia claves públicas y descarga claves privadas — todo desde el panel de ClawHost. Asigna claves a tus claws para acceso seguro.',
                cta: 'Gestionar claves SSH'
            },
            exportConfig: {
                subject: '¿Lo sabías? Exporta la configuración de tu claw',
                preview: 'Descarga tu configuración como archivo portable',
                heading: 'Lleva tu config contigo',
                description:
                    'Exporta la configuración y ajustes de tu claw como archivo descargable. Haz una copia de seguridad o úsalo para replicar tu entorno.',
                cta: 'Exportar config'
            },
            multiProvider: {
                subject: '¿Lo sabías? Despliega en 3 proveedores cloud',
                preview: 'Elige entre Hetzner, DigitalOcean y Vultr',
                heading: 'Tu nube, tu elección',
                description:
                    'Despliega tus claws en Hetzner, DigitalOcean o Vultr. Compara precios, ubicaciones y especificaciones — y elige el proveedor que mejor se adapte.',
                cta: 'Comparar proveedores'
            },
            multiLanguage: {
                subject: '¿Lo sabías? ClawHost habla tu idioma',
                preview: 'Usa ClawHost en 14 idiomas',
                heading: 'ClawHost en tu idioma',
                description:
                    'Cambia todo el panel de ClawHost a cualquiera de los 14 idiomas disponibles. Desde botones hasta mensajes de error — todo traducido.',
                cta: 'Cambiar idioma'
            },
            subdomain: {
                subject: '¿Lo sabías? Cada claw tiene su propio subdominio',
                preview: 'Accede a tu claw desde cualquier lugar con una URL propia',
                heading: 'Accede desde cualquier lugar',
                description:
                    'Cada claw recibe un subdominio único para acceder a tu instancia OpenClaw desde cualquier lugar. Sin redirección de puertos, sin redes locales — solo una URL.',
                cta: 'Ver tu subdominio'
            },
            darkMode: {
                subject: '¿Lo sabías? ClawHost tiene modo oscuro',
                preview: 'Alterna entre temas claro y oscuro',
                heading: 'Cómodo para la vista',
                description:
                    'Alterna entre los temas claro y oscuro en el panel de ClawHost. Tu preferencia se guarda y aplica automáticamente en cada visita.',
                cta: 'Probar modo oscuro'
            },
            reinstall: {
                subject: '¿Lo sabías? Reinstala OpenClaw con un clic',
                preview: 'Reinicia tu instancia OpenClaw sin perder tu servidor',
                heading: 'Nuevo comienzo, mismo servidor',
                description:
                    'Reinstala el runtime de OpenClaw en tu servidor existente con un solo clic. Tu servidor permanece intacto — solo OpenClaw recibe una instalación limpia.',
                cta: 'Saber más'
            },
            yearlyPlans: {
                subject: '¿Lo sabías? Ahorra con planes anuales',
                preview: 'Cambia a facturación anual y paga menos',
                heading: 'Paga menos, obtén más',
                description:
                    'Cambia a facturación anual y ahorra en tu suscripción claw. El mismo gran servicio, a menor precio — cancela en cualquier momento.',
                cta: 'Ver planes'
            }
        }
    },
    auth: {
        signIn: 'Iniciar sesión',
        signInDescription:
            'Inicia sesión en tu cuenta de ClawHost para administrar tus instancias de OpenClaw.',
        signingIn: 'Iniciando sesión...',
        verifyCode: 'Verificar código',
        checkYourEmail: 'Revisa tu correo',
        checkYourEmailHeading: 'Revisa tu correo',
        codeSentTo: 'Enviamos un código de 6 dígitos a',
        signInToDeployOpenClaw:
            'Inicia sesión para administrar y desplegar instancias de OpenClaw.',
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
        showAllClaws: 'Mostrar todos los claws de todos los usuarios',
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
        pageDescription: 'Compra tu licencia para auto-alojar instancias de OpenClaw localmente con nuestra aplicación Go.',
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
        featureUnlimitedAgents: 'Agentes ilimitados',
        featureDevices: 'Dispositivos ilimitados',
        featureUpdates: 'Actualizaciones para siempre',
        featureSupport: 'Soporte prioritario',
        featureCloud: 'Todas las funciones en la nube, localmente',
        whatsIncluded: 'Qué incluye',
        permanentNote: 'Las licencias son permanentes e irrevocables. Una vez comprada, es tuya para siempre.',
        gateTitle: 'Licencia requerida',
        gateDescription: 'Necesitas una licencia ClawHost Go para desplegar y gestionar instancias de OpenClaw localmente.'
    },
    network: {
        unstable: 'Conexión inestable',
        unstableDescription: 'Tu conexión a internet es inestable. Algunas funciones podrían no funcionar correctamente.',
        offline: 'Sin conexión a internet',
        offlineDescription: 'Actualmente estás sin conexión. Las funciones que requieren acceso a internet no estarán disponibles.',
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
        clawActions: 'Acciones del claw',
        noClawsYet: 'Sin Claws',
        noClawsDescription:
            'No se encontró ningún claw desplegado. Pero puedes desplegar tu primer claw en cualquier momento desde $25/m. Solo usa IA.',
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
        viewServerCredentials: 'Ver credenciales del servidor',
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
        provider: 'Proveedor',
        nextBilling: 'Próxima facturación',
        lastBilling: 'Última facturación',
        version: 'Versión',
        gatewayToken: 'Token del gateway',
        gatewayTokenDescription:
            'Usa este token para autenticarte con tu gateway',
        scheduledForDeletion: 'Programado para eliminación',
        scheduledDeletionShort: 'Se elimina el {{date}}',
        deletionDate: 'Este claw será eliminado el {{date}}',
        deletionTooltip:
            'Programado para eliminación el {{date}}. Para cancelar, usa el menú.',
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
        diagnosticsRepair: 'Reparar',
        diagnosticsRepairDescription:
            'Elimina los límites de memoria, aplica la configuración de servicio más reciente y reinicia el gateway. Esto soluciona los problemas más comunes.',
        diagnosticsRepairSuccess: 'Instancia reparada exitosamente.',
        diagnosticsRepairFailed:
            'Reparación aplicada pero el gateway aún no responde!',
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
        updateInstance: 'Actualizar instancia',
        updateInstanceSuccess: 'Instancia actualizada exitosamente.',
        updateInstanceFailed: 'Error al actualizar la instancia!',
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
        chatTab: 'Chat',
        playgroundTab: 'Playground',
        userTab: 'Usuario',
        adminTab: 'Admin',
        adminTitle: 'Admin',
        adminDescription: 'Administra todos los claws de la plataforma.',
        adminNoClaws: 'Aún no hay claws en la plataforma.',
        adminAccessDenied: 'No tienes permiso para acceder a esta página!',
        owner: 'Propietario',
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
    chat: {
        explorer: 'Explorador',
        selectAgent: 'Sin selección',
        selectAgentDescription:
            'Selecciona un claw o agente de la barra lateral.',
        noAgents: 'No hay agentes disponibles',
        noAgentsDescription:
            'Despliega un claw para comenzar a chatear con agentes',
        openSidebar: 'Abrir barra lateral',
        clawNotReady: 'El claw aún no está listo',
        notConfigured: 'No configurado',
        addAgent: 'Agregar agente',
        viewTree: 'Vista de árbol',
        viewList: 'Vista de lista',
        clawSettings: 'Configuración del claw'
    },
    createClaw: {
        title: 'Desplegar OpenClaw',
        description: 'Configura tu servidor y comienza a construir con IA.',
        clawName: 'Nombre',
        clawNamePlaceholder: 'ej. panda-acogedor',
        clawNameInvalidChars: 'Solo se permiten letras, números y guiones!',
        autoGenerateNameHint: 'Dejar vacío para generar un nombre automáticamente.',
        provider: 'Proveedor',
        providerHetzner: 'Hetzner',
        providerDigitalOcean: 'DigitalOcean',
        providerVultr: 'Vultr',
        providerLocal: 'Local',
        providerAws: 'AWS',
        comingSoon: 'Pronto',
        location: 'Ubicación',
        locationUnavailable: 'No disponible',
        locationUnavailableForPlan: 'No disponible',
        plan: 'Servidor',
        planUnavailable: 'No disponible',
        planUnavailableForLocation: 'No disponible en esta ubicación',
        providerUnavailable: 'Este proveedor no está disponible actualmente.',
        providerDisabledHetznerRecommended: 'No disponible',
        providerAtCapacity:
            'Debido a la alta demanda, temporalmente nos hemos quedado sin servidores de este proveedor. Estamos trabajando activamente para resolver esto!',
        advancedOptions: 'Opciones avanzadas opcionales',
        rootPassword: 'Contraseña root',
        rootPasswordPlaceholder: 'Ingresa una contraseña o genera una',
        gatewayTokenPlaceholder: 'ej. a1b2c3d4e5f6...',
        autoGenerateGatewayTokenHint:
            'Opcional. Sin token si se deja vacío.',
        autoGeneratePasswordHint:
            'Opcional. Sin contraseña si se deja vacío.',
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
            'Despliega OpenClaw en más de 30 regiones globales en Hetzner, DigitalOcean o Vultr y elige la ubicación más cercana a ti.',
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
        clawHostControl: 'Control ClawHost',
        clawHostControlDescription:
            'Gestiona archivos, actualizaciones, canales, variables, habilidades y más opciones de configuración directamente desde la plataforma.',
        skillsMarketplace: '5.000+ habilidades',
        skillsMarketplaceDescription:
            'Explora e instala más de 5.000 habilidades listas para usar con un solo clic. Amplía tu OpenClaw al instante.',
        directChat: 'Chat directo',
        directChatDescription:
            'Chatea con tus agentes de IA directamente desde la plataforma. Sin necesidad de herramientas o interfaces externas.',
        multipleAgents: 'Múltiples agentes',
        multipleAgentsDescription:
            'Ejecuta y gestiona múltiples agentes de IA en una sola instancia. Cada uno con su propia configuración y propósito.',
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
            'Elige entre más de 45 servidores en nuestros proveedores según tus necesidades.',
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
            'No. Nosotros manejamos toda la infraestructura, configuración y mantenimiento. Puedes configurar y administrar OpenClaw a través de su interfaz, conectar canales y personalizar el uso — sin tocar servidores ni infraestructura.',
        faq5Question: '¿Qué ubicaciones están disponibles?',
        faq5Answer:
            'Ofrecemos más de 30 ubicaciones de servidores en todo el mundo a través de Hetzner, DigitalOcean y Vultr, incluyendo EE.UU., Europa, Asia y más. Puedes desplegar OpenClaw en múltiples servidores en diferentes regiones si es necesario.',
        faq6Question: '¿Cuánto cuesta?',
        faq6Answer:
            'Los precios se basan en el servidor que selecciones. Con más de 45 opciones de servidor que van desde nivel básico hasta alto rendimiento en tres proveedores, tú eliges lo que se adapte a tus necesidades y presupuesto.',
        faq7Question: '¿Puedo acceder a mi servidor directamente?',
        faq7Answer:
            'Sí. Además del acceso a OpenClaw vía URL de subdominio, tienes acceso completo al servidor y su infraestructura subyacente, dándote libertad total para personalizar y ejecutar lo que necesites.',
        faq8Question: '¿Dónde están alojados los servidores?',
        faq8Answer:
            'Todos los servidores están alojados en Hetzner Cloud, DigitalOcean y Vultr, proveedores de nube confiables conocidos por su hardware de alto rendimiento y excelente disponibilidad, utilizados por infraestructuras a gran escala.',
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
        comparisonSubdomainOthers: 'Acceso solo con canales sociales',
        comparisonInfraUs: 'Infraestructura bajo demanda',
        comparisonInfraOthers: 'Servidores limitados',
        comparisonDataUs: 'Tus datos son tuyos',
        comparisonDataOthers: 'Tus datos no son tuyos',
        comparisonMultipleUs: 'Múltiples OpenClaw, un solo Claw',
        comparisonMultipleOthers: 'Solo un OpenClaw',
        comparisonAgentsUs: 'Múltiples agentes por Claw',
        comparisonAgentsOthers: 'Solo un agente',
        comparisonOpenSourceUs: 'Completamente código abierto',
        comparisonOpenSourceOthers: 'Código cerrado',
        comparisonExportUs: 'Exporta tu OpenClaw a cualquier lugar',
        comparisonExportOthers: 'Dependencia del proveedor',
        comparisonProvidersUs: 'Múltiples proveedores de servidores',
        comparisonProvidersOthers: 'Un solo proveedor',
        comparisonSocialsUs: 'Presencia en redes sociales',
        comparisonSocialsOthers: 'Sin redes sociales',
        comparisonChatUs: 'Chatea directamente con tu Claw',
        comparisonChatOthers: 'Chat solo a través de canales',
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
        release13Date: '19 de marzo de 2026',
        release13Title: 'Nuevos idiomas y ClawHost Go Beta',
        release13Description:
            '10 nuevos idiomas y ClawHost Go en beta para desplegar OpenClaw localmente con un clic en macOS y Windows.',
        release13Feature1:
            '10 nuevos idiomas añadidos: chino, hindi, árabe, ruso, japonés, turco, italiano, polaco, neerlandés y portugués',
        release13Feature2:
            'Versión beta de ClawHost Go para macOS y Windows, despliega OpenClaw localmente con un clic',
        release12Date: '14 de marzo de 2026',
        release12Title: 'Planes anuales, modo de voz y más',
        release12Description:
            'Suscripciones anuales con 2 meses gratis, modo de voz, reinstalación de instancia y una página de presentación inicial para ClawHost Go.',
        release12Feature1: 'Página de presentación de ClawHost Go, alojamiento local con ClawHost',
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
        release11Dropped1:
            'Eliminación de solicitudes de funciones para simplificación',
        release10Date: '22 de febrero de 2026',
        release10Title:
            'Solicitudes de funciones, explorador de archivos y correcciones',
        release10Description:
            'Solicitudes de funciones de la comunidad, soporte ampliado de edición de archivos y varias correcciones.',
        release10Feature1:
            'Solicitudes de funciones gestionadas y publicadas automáticamente por los agentes de OpenClaw',
        release10Feature2:
            'Corrección de habilidades que a veces no se instalaban desde el marketplace de ClawHub',
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
            'Grandes mejoras en el chat y playground con interacción por voz, mercado de habilidades ClawHub y archivos adjuntos para agentes.',
        release7Feature1:
            'Refactorización del chat y playground para una experiencia más fluida y responsiva',
        release7Feature2:
            'Interacción por voz en chats, graba y transcribe voz directamente en el navegador',
        release7Feature3:
            'Integración de habilidades de ClawHub con más de 5,000 habilidades disponibles para instalar y administrar',
        release7Feature4:
            'Vista y uso de archivos adjuntos para agentes, envía imágenes y documentos en el chat',
        release6Date: '16 de febrero de 2026',
        release6Title: 'Canales, habilidades y chat con agentes',
        release6Description:
            'Control total sobre tus canales, habilidades y agentes de OpenClaw. Administra y chatea con todo directamente desde el panel.',
        release6Feature1:
            'Administra canales directamente, agrega, elimina y configura canales sin tocar el servidor',
        release6Feature2:
            'Administra habilidades directamente, instala, actualiza y organiza habilidades de agentes desde el panel',
        release6Feature3:
            'Chatea con tus agentes desde el playground, interactúa con cualquier agente en tiempo real',
        release6Feature4:
            'Inicia sesión con Google o GitHub, autenticación rápida y segura sin códigos por correo',
        release1Date: '8 de febrero de 2026',
        release1Title: 'Lanzamiento inicial',
        release1Description:
            'El primer lanzamiento oficial de ClawHost. Despliega OpenClaw en tu propio VPS con un solo clic.',
        release1Feature1: 'Despliegue de OpenClaw en un clic en Hetzner Cloud',
        release1Feature2:
            'Panel para administrar claws, iniciar, detener, reiniciar y eliminar instancias',
        release1Feature3:
            '18 planes de servidor Hetzner con vCPU dedicado, RAM y opciones de almacenamiento',
        release1Feature4:
            '6 ubicaciones de servidor Hetzner en EE.UU., Europa y Asia',
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
        release2Title: 'DigitalOcean y más',
        release2Description:
            'Infraestructura multi-proveedor y una nueva forma de mantenerte al día con todo en ClawHost.',
        release2Feature1: 'DigitalOcean como segundo proveedor de nube',
        release2Feature2:
            '7 planes de servidor DigitalOcean con vCPU dedicado, RAM y opciones de almacenamiento',
        release2Feature3:
            'Más de 10 ubicaciones de servidor DigitalOcean en EE.UU., Europa, Asia y más',
        release2Feature4:
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
        release4Date: '11 de febrero de 2026',
        release4Title: 'Proveedor Vultr',
        release4Description:
            'Vultr como tercer proveedor de nube con 22 planes de servidor y más de 30 ubicaciones globales.',
        release4Feature1: 'Vultr como tercer proveedor de nube',
        release4Feature2:
            '22 planes de servidor Vultr en los niveles Regular, Alto rendimiento y Alta frecuencia',
        release4Feature3:
            'Más de 30 ubicaciones de servidor Vultr en EE.UU., Europa, Asia y más',
        release5Date: '14 de febrero de 2026',
        release5Title: 'Agentes y exportación de datos',
        release5Description:
            'Playground de agentes, administración multi-agente y exportación de datos portable para tus instancias de OpenClaw.',
        release5Feature1:
            'Playground de agentes y resumen en un clic, agrega y administra múltiples agentes',
        release5Feature2: 'Exporta tu OpenClaw como un archivo zip portable',
        release5Feature3:
            'Playground interactivo con visualización de grafo de Claws y agentes',
        release5Feature4:
            'Se eliminó la alternancia entre vista de cuadrícula y lista en favor de un diseño de panel unificado'
    },
    playground: {
        title: 'Playground',
        description:
            'Visualiza tus Claws y sus agentes en un grafo interactivo.',
        subtitle: 'Topología de agentes a través de tu infraestructura',
        noClawsYet: 'Sin Claws',
        noClawsDescription: 'Despliega tu primer Claw para interactuar con él.',
        loadingAgents: 'Cargando agentes',
        unreachable: 'Inaccesible',
        offline: 'Fuera de línea',
        noAgents: 'Sin agentes',
        agentCount: '{{count}} Agente',
        agentCountPlural: '{{count}} Agentes',
        agentModel: 'Modelo',
        zoomLabel: '{{percent}}%',
        fitView: 'Centrar',
        nodesOutOfView: 'Claws fuera de vista',
        nodeOutOfView: 'Claw fuera de vista',
        addAgent: 'Agregar agente',
        closeDetails: 'Cerrar',
        tabInfo: 'Info',
        tabLogs: 'Registros',
        tabDiagnostics: 'Salud',
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
        tabChat: 'Chat',
        tabConfiguration: 'Configuración',
        tabSettings: 'Ajustes',
        tabEnvs: 'Vars',
        agentOnClaw: 'en {{clawName}}',
        cannotDeleteDefaultAgent:
            'El agente predeterminado no puede ser eliminado!',
        configurationModel: 'Modelo',
        configurationModelPlaceholder: 'Selecciona un modelo',
        configurationModelDescription:
            'El modelo de IA que usa este agente. Cambiar el modelo puede requerir configurar la clave API correspondiente.',
        configurationEnvVars: 'Variables de entorno',
        configurationEnvVarsDescription:
            'Claves API y variables de entorno almacenadas en ~/.openclaw/.env en la instancia.',
        configurationAddEnvVar: 'Agregar variable',
        configurationKeyPlaceholder: 'NOMBRE_VARIABLE',
        configurationValuePlaceholder: 'valor',
        configurationSave: 'Guardar',
        configurationSaving: 'Guardando...',
        configurationSaved: 'Configuración del agente guardada.',
        configurationSaveFailed:
            'Error al guardar la configuración del agente!',
        configurationLoading: 'Cargando configuración...',
        configurationLoadFailed: 'Error al cargar la configuración del agente!',
        configurationLoadFailedDescription:
            'No se pudo obtener la configuración de este agente. Por favor, intenta más tarde.',
        configurationRemoveVar: 'Eliminar',
        configurationApiKey: 'Clave API',
        configurationApiKeyDescription:
            'Requerida para {{modelName}}. Esta clave se almacena en ~/.openclaw/.env en la instancia.',
        configurationApiKeyPlaceholder: 'Ingresa tu clave API',
        tabVariables: 'Variables',
        variablesDescription:
            'Variables de entorno almacenadas en ~/.openclaw/.env en esta instancia.',
        variablesEmpty: 'No se encontraron variables de entorno.',
        variablesAddVariable: 'Agregar variable',
        variablesSave: 'Guardar variables',
        variablesSaving: 'Guardando...',
        variablesSaved: 'Variables de entorno guardadas.',
        variablesSaveFailed: 'Error al guardar las variables de entorno!',
        variablesLoading: 'Cargando variables...',
        variablesLoadFailed: 'Error al cargar las variables de entorno!',
        variablesLoadFailedDescription:
            'No se pudieron obtener las variables de esta instancia. Por favor, intenta más tarde.',
        variablesInvalidKey: 'Solo letras, números y guiones bajos!',
        variablesEmptyValue: 'El valor no puede estar vacío!',
        variablesDuplicateKey: 'Nombre de variable duplicado!',
        variablesDeleteTitle: 'Eliminar variable',
        variablesDeleteDescription:
            '¿Estás seguro de que deseas eliminar {{key}}? Esto la eliminará inmediatamente de la instancia.',
        variablesDeleteConfirm: 'Eliminar',
        variablesDontAskAgain:
            'No volver a preguntar al eliminar variables en esta sesión',
        variablesDeleted: 'Variable eliminada.',
        variablesOperationPending:
            'Deshabilitado mientras se completa una operación anterior.',
        addAgentTitle: 'Agregar agente',
        addAgentDescription: 'Agrega un nuevo agente a {{clawName}}.',
        addAgentDescriptionNoClaw:
            'Selecciona un claw y configura tu nuevo agente.',
        addAgentSelectClaw: 'Claw',
        addAgentSelectClawPlaceholder: 'Selecciona un claw',
        addAgentName: 'Nombre',
        addAgentNamePlaceholder: 'Ingresa el nombre del agente',
        addAgentModel: 'Modelo',
        addAgentModelPlaceholder: 'Selecciona un modelo',
        addAgentApiKey: 'Clave API',
        addAgentApiKeyPlaceholder: 'Ingresa tu clave API (opcional)',
        addAgentApiKeyConfigured:
            '{{envVar}} ya configurado. Editable en la pestaña Variables después de agregar.',
        addAgentSubmit: 'Agregar agente',
        addAgentSuccess: 'Agente agregado exitosamente.',
        addAgentFailed: 'Error al agregar el agente!',
        deleteAgent: 'Eliminar agente',
        deleteAgentTitle: 'Eliminar agente',
        deleteAgentDescription:
            '¿Estás seguro de que deseas eliminar el agente "{{agentName}}"? Esta acción no se puede deshacer. Las variables de entorno no serán eliminadas.',
        deleteAgentConfirm: 'Eliminar',
        agentDontAskAgain:
            'No volver a preguntar al eliminar agentes en esta sesión',
        deleteAgentDeleting: 'Eliminando...',
        deleteAgentSuccess: 'Agente eliminado exitosamente.',
        deleteAgentFailed: 'Error al eliminar el agente!',
        configurationName: 'Nombre',
        configurationNamePlaceholder: 'Ingresa el nombre del agente',
        configurationNameDescription: 'Solo letras, números y guiones.',
        agentNameRequired: 'El nombre del agente es obligatorio!',
        agentNameInvalidChars: 'Solo se permiten letras, números y guiones!',
        agentNameDuplicate: 'Ya existe un agente con este nombre!',
        chatConnecting: 'Conectando...',
        chatAuthenticating: 'Autenticando...',
        chatDisconnected: 'Desconectado',
        chatError: 'Error de conexión!',
        chatConnected: 'Conectado',
        chatInputPlaceholder: 'Escribe un mensaje...',
        chatInputDisabled: 'Conéctate para chatear con este agente',
        chatSend: 'Enviar mensaje',
        chatAbort: 'Detener',
        chatStopProcess: 'Detener proceso',
        chatRemoveAttachment: 'Eliminar archivo adjunto',
        chatThinking: 'Pensando',
        chatLoadingHistory: 'Cargando mensajes...',
        chatNoMessages: 'Sin mensajes',
        chatNoMessagesDescription:
            'Envía un mensaje para iniciar una conversación con este agente.',
        chatErrorMessage: 'Ocurrió un error al generar una respuesta!',
        chatAbortedMessage: 'La respuesta fue detenida.',
        chatPlaySpeech: 'Leer en voz alta',
        chatReplaySpeech: 'Repetir',
        chatStopSpeech: 'Detener',
        chatSpeechFailed: 'Error al generar el habla!',
        chatReadOnlyPlaceholder: 'Chat disponible en tus propios Claws.',
        chatReadOnlyUser:
            '¡Hola! ¿Puedes ayudarme a configurar un proyecto Node.js?',
        chatReadOnlyAssistant:
            '¡Por supuesto! Puedo ayudarte a inicializar un nuevo proyecto Node.js. ¿Te gustaría que cree un package.json con algunas dependencias comunes?',
        chatReadOnlyReply:
            '¡Esto es una vista previa! Despliega tu propio OpenClaw con un clic y empieza a chatear con tus agentes de IA en minutos.',
        chatReadOnlyUser2:
            '¿Puedes ejecutar la suite de pruebas y verificar si hay fallos?',
        chatReadOnlyAssistant2:
            '¡Claro! Ejecutaré todas las pruebas ahora. 3 pasaron, 0 fallaron. Todo se ve bien — todas las aserciones pasan.',
        chatReadOnlyGoUser: 'Oye, ¿puedes ayudarme a automatizar mi pipeline de despliegue?',
        chatReadOnlyGoAssistant:
            '¡Por supuesto! Puedo configurar un pipeline CI/CD para ti. ¿Quieres que empiece con un workflow de GitHub Actions que compile, pruebe y despliegue automáticamente?',
        chatReadOnlyGoReply:
            '¡Esto es una vista previa! Obtén ClawHost Go y ejecuta OpenClaw localmente — tu máquina, tus datos, sin necesidad de cloud.',
        chatReadOnlyGoUser2: '¿Puedes monitorear mis servicios locales y alertarme si algo se cae?',
        chatReadOnlyGoAssistant2:
            '¡En ello! Configuraré chequeos de salud para todos tus servicios. Monitoreando 4 endpoints actualmente — todos saludables y respondiendo.',
        chatConnectionFailed: 'Error al conectar con este agente!',
        chatConnectionFailedDescription:
            'Asegúrate de que el Claw esté ejecutándose y sea accesible.',
        chatNotConfigured: 'Agente no configurado!',
        chatNotConfiguredDescription:
            'Selecciona un modelo y configura una clave API en la pestaña de Configuración para comenzar a chatear.',
        chatConfigureButton: 'Configurar agente',
        chatToday: 'Hoy',
        chatYesterday: 'Ayer',
        chatExpandFullscreen: 'Expandir chat',
        chatAttachFile: 'Adjuntar archivo',
        chatDropFiles: 'Suelta archivos para adjuntar',
        chatDropFilesDescription:
            'Imágenes, PDFs y archivos de texto hasta 5 MB.',
        chatVoiceInput: 'Entrada de voz',
        chatVoiceListening: 'Escuchando...',
        chatVoiceNotSupported:
            'La entrada de voz no es compatible con este navegador!',
        chatVoiceMode: 'Modo de voz',
        chatVoiceModeTapToSpeak: 'Toca para empezar a hablar',
        chatVoiceModeListening: 'Escuchando...',
        chatVoiceModeClose: 'Salir del modo de voz',
        chatVoiceModeTranscribing: 'Transcribiendo...',
        chatVoiceModeThinking: 'Pensando...',
        chatVoiceModeResponding: 'Respondiendo...',
        chatVoiceModePreparing: 'Preparando voz...',
        chatVoiceModeSpeaking: 'Hablando...',
        chatVoiceModeInputDevice: 'Micrófono',
        chatVoiceModeOutputDevice: 'Altavoz',
        chatVoiceModeNotSupported:
            'El reconocimiento de voz no es compatible con este navegador.',
        chatVoiceModeNoMicrophone:
            'No se detectó micrófono. Conecta uno para usar el modo de voz.',
        chatVoiceModeNoSpeaker:
            'No se detectó altavoz. Conecta uno para usar el modo de voz.',
        chatAttachmentNotSupported:
            'Este tipo de archivo no es compatible. Usa imágenes, PDFs o archivos de texto!',
        chatNoPreview: 'Vista previa no disponible!',
        chatDownloadFile: 'Descargar archivo',
        chatCopyMessage: 'Copiar mensaje',
        tabChannels: 'Canales',
        channelsDescription:
            'Configura los canales de mensajería para esta instancia. Los mensajes se enrutan a los agentes mediante vínculos.',
        channelsWhatsApp: 'WhatsApp',
        channelsWhatsAppPairDevice: 'Vincular dispositivo',
        channelsWhatsAppPairing: 'Esperando código QR...',
        channelsWhatsAppScanQr:
            'Escanea este código QR con WhatsApp para vincular tu dispositivo.',
        channelsWhatsAppScanInstructions:
            'Abre WhatsApp > Ajustes > Dispositivos vinculados > Vincular un dispositivo',
        channelsWhatsAppQrRefreshed:
            'El código QR anterior expiró. Escanea el nuevo a continuación.',
        channelsWhatsAppPaired: 'WhatsApp vinculado exitosamente.',
        channelsWhatsAppPairFailed:
            'Error en el emparejamiento. Inténtalo de nuevo!',
        channelsWhatsAppAlreadyPaired: 'WhatsApp ya está vinculado!',
        channelsWhatsAppUnpair: 'Desvincular',
        channelsWhatsAppConnected: 'Conectado',
        channelsWhatsAppRepair: 'Re-vincular',
        channelsWhatsAppChecking: 'Verificando conexión...',
        channelsVersionUnsupported: 'La configuración de canales no está disponible en esta versión. Puedes conectar manualmente usando la pestaña Terminal o actualizar OpenClaw.',
        channelsVersionUnsupportedDocs: 'Ver guía de configuración',
        channelsTelegram: 'Telegram',
        channelsDiscord: 'Discord',
        channelsSlack: 'Slack',
        channelsSignal: 'Signal',
        channelsEnabled: 'Habilitado',
        channelsAccount: 'Número de teléfono de la cuenta',
        channelsAccountPlaceholder: '+15551234567',
        channelsBotToken: 'Token del bot',
        channelsBotTokenPlaceholder: 'Ingresa el token del bot',
        channelsAppToken: 'Token de la app',
        channelsAppTokenPlaceholder: 'Ingresa el token de la app',
        channelsToken: 'Token del bot',
        channelsTokenPlaceholder: 'Ingresa el token del bot',
        channelsSigningSecret: 'Secreto de firma',
        channelsSigningSecretPlaceholder: 'Ingresa el secreto de firma',
        channelsDmPolicy: 'Política de DM',
        channelsDmPolicyOpen: 'Abierto',
        channelsDmPolicyPairing: 'Emparejamiento',
        channelsDmPolicyAllowlist: 'Lista de permitidos',
        channelsDmPolicyDisabled: 'Deshabilitado',
        channelsAllowFrom: 'Permitir desde',
        channelsAllowFromPlaceholder: 'IDs permitidos, separados por coma',
        channelsSave: 'Guardar',
        channelsSaved: 'Canales actualizados exitosamente.',
        channelsSaveFailed: 'Error al actualizar los canales!',
        channelsLoading: 'Cargando canales...',
        channelsLoadFailed: 'Error al cargar los canales!',
        channelsLoadFailedDescription:
            'No se pudo obtener la configuración de los canales. Por favor, intenta de nuevo.',
        channelsNoChanges: 'No hay cambios que guardar!',
        bindingsDescription:
            'Asigna canales de mensajería a este agente. Cada canal solo puede ser enrutado a un agente a la vez.',
        bindingsNoChannels: 'No hay canales habilitados.',
        bindingsNoChannelsDescription:
            'Habilita canales en la configuración de la instancia primero, luego asígnalos a los agentes aquí.',
        bindingsSaving: 'Guardando...',
        bindingsSaved: 'Vinculaciones actualizadas exitosamente.',
        bindingsSaveFailed: '¡Error al actualizar las vinculaciones!',
        tabSkills: 'Habilidades',
        skillsDescription:
            'Administra habilidades compartidas disponibles para todos los agentes en esta instancia.',
        skillsSearch: 'Buscar habilidades...',
        skillsNoResults: 'Ninguna habilidad coincide con tu búsqueda.',
        skillsEmpty: 'Sin Skills',
        skillsSave: 'Guardar habilidades',
        skillsSaved: 'Habilidades actualizadas exitosamente.',
        skillsSaveFailed: 'Error al actualizar las habilidades!',
        skillsLoading: 'Cargando habilidades...',
        skillsLoadFailed: 'Error al cargar las habilidades!',
        skillsLoadFailedDescription:
            'No se pudo obtener la configuración de las habilidades. Por favor, intenta de nuevo.',
        agentSkillsDescription:
            'Habilidades instaladas en el espacio de trabajo de este agente.',
        agentSkillsInstalling: 'Instalando...',
        agentSkillsInstalled: 'Habilidad instalada exitosamente.',
        agentSkillsInstallFailed: 'Error al instalar la habilidad!',
        agentSkillsRemoving: 'Eliminando...',
        agentSkillsRemoved: 'Habilidad eliminada exitosamente.',
        agentSkillsRemoveFailed: 'Error al eliminar la habilidad!',
        agentSkillsEmpty: 'No hay habilidades instaladas.',
        agentSkillsEmptyDescription:
            'Instala una habilidad para extender las capacidades de este agente.',
        agentSkillsNamePlaceholder: 'Nombre de la habilidad',
        agentSkillsConfirmRemove: '¿Eliminar habilidad "{{skillName}}"?',
        agentSkillsConfirmRemoveDescription:
            'Esto eliminará la habilidad del espacio de trabajo del agente.',
        skillsBundledTab: 'Integradas',
        skillsClawHubTab: 'ClawHub',
        clawHubSearch: 'Buscar habilidades en ClawHub...',
        clawHubNoResults: 'No se encontraron habilidades en ClawHub.',
        clawHubEmpty: 'No hay habilidades de ClawHub instaladas.',
        clawHubEmptyDescription:
            'Busca e instala habilidades desde el mercado de ClawHub.',
        clawHubInstall: 'Instalar',
        clawHubInstalled: 'Habilidad instalada desde ClawHub.',
        clawHubInstallFailed: 'Error al instalar la habilidad desde ClawHub!',
        clawHubRemove: 'Eliminar',
        clawHubRemoved: 'Habilidad de ClawHub eliminada.',
        clawHubRemoveFailed: 'Error al eliminar la habilidad de ClawHub!',
        clawHubUpdate: 'Actualizar',
        clawHubUpdated: 'Habilidad actualizada desde ClawHub.',
        clawHubUpdateFailed: 'Error al actualizar la habilidad de ClawHub!',
        clawHubUpdateAvailable: 'v{{version}} disponible',
        clawHubBy: 'por {{author}}',
        clawHubDownloads: '{{count}} descargas',
        clawHubVersion: 'v{{version}}',
        clawHubLoadFailed: 'Error al cargar ClawHub!',
        clawHubLoadFailedDescription:
            'No se pudo conectar al mercado de ClawHub. Por favor, intenta de nuevo.',
        tabVersions: 'Versiones',
        versionsSearch: 'Buscar versiones...',
        versionsEmpty: 'No se encontraron versiones',
        versionsEmptyDescription: 'Ninguna versión coincide con tu búsqueda.',
        versionsErrorDescription:
            'Error al cargar las versiones. Por favor, verifica tu conexión e inténtalo de nuevo!',
        versionsChangelog: 'Ver changelogs en npm',
        versionCurrent: 'Actual',
        versionLatest: 'Última',
        versionInstall: 'Instalar',
        versionInstalling: 'Instalando...',
        versionInstallSuccess: 'Versión {{version}} instalada con éxito.',
        versionInstallFailed: 'Error al instalar la versión!',
        versionDownloads: '{{count}} descargas',
        versionChangelog: 'Changelog',
        versionOutdated: 'Obsoleto',
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
        serverInfoConfig:
            'Configuración y estado del servidor (alojado en Hetzner Cloud)',
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
        changesToTermsTitle: '10. Cambios a los términos',
        changesToTermsText:
            'Nos reservamos el derecho de modificar estos términos en cualquier momento. Notificaremos a los usuarios de cualquier cambio material por correo electrónico o a través del Servicio. El uso continuado del Servicio después de dichas modificaciones constituye la aceptación de los términos actualizados.',
        contactTitle: '11. Información de contacto',
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
        signIn: 'Iniciar sesión',
        signInDescription:
            'Inicia sesión para administrar tus instancias de OpenClaw.',
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
        signingIn: 'Iniciando sesión...',
        signOut: 'Cerrar sesión',
        signedInAs: 'Sesión iniciada como',
        loadMore: 'Cargar más',
        chatWithYourClaw: 'Chatea con tu Claw',
        deployClaw: 'Desplegar Claw',
        deployYourFirstClaw: 'Despliega tu primer Claw',
        voiceMode: 'Modo de voz',
        voiceListening: 'Escuchando...',
        voiceTapToSpeak: 'Toca el orbe para comenzar'
    },
    announcement: {
        title: 'Aviso de servicio',
        message:
            'Debido a la alta demanda, los despliegues de {{providers}} no están disponibles temporalmente. Los claws existentes funcionan con normalidad.'
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
        featureTechnicalSkill: 'Habilidades técnicas requeridas',
        featureOneClickDeploy: 'Despliegue con un clic',
        featureMultipleInstances: 'Múltiples instancias',
        featureMultipleAgents: 'Múltiples agentes por instancia',
        featureSkillsMarketplace: 'Marketplace de habilidades',
        featureChannelSupport: 'Soporte de canales',
        featureAgentConfig: 'Configuración de agentes',
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
        featureDirectChat: 'Chat directo',
        featureOneClickVersion: 'Cambio de versión con un clic',
        featureWebTerminal: 'Terminal web',
        featureSocials: 'Redes sociales',
        dedicatedVps: 'VPS dedicado',
        sharedContainers: 'Contenedores compartidos',
        isolatedContainers: 'Contenedores aislados',
        cloudWorkspaces: 'Espacios de trabajo en la nube',
        threeProviders: 'Hetzner, DigitalOcean, Vultr',
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
        fiveThousandSkills: '5.000+ habilidades (ClawHub)',
        noMarketplace: 'Sin marketplace',
        allChannels: 'WhatsApp, Telegram, Discord, Slack, Signal',
        telegramDiscord: 'Telegram, Discord',
        discordGithubSlack: 'Discord, GitHub, Slack',
        telegramGmailWhatsapp: 'Telegram, Gmail, WhatsApp',
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
        builtInChat: 'Integrado',
        builtInTerminal: 'Sin SSH',
        notAvailable: 'No disponible',
        disclaimer: '¿Algo cambió o es incorrecto? Escríbenos a',
        disclaimerOr: 'o abre un pull request en',
        github: 'GitHub',
        ctaTitle: '¿Listo para ver la diferencia?',
        ctaDescription:
            'Despliega OpenClaw en tu propio servidor dedicado. Propiedad total, precios transparentes y listo en minutos.'
    }
} as const

export default es