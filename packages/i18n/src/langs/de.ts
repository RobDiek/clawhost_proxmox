import type { Translations } from '../types'

const de: Translations = {
    common: {
        loading: 'Laden...',
        save: 'Speichern',
        cancel: 'Abbrechen',
        confirm: 'Bestätigen',
        delete: 'Löschen',
        deleting: 'Wird gelöscht...',
        back: 'Zurück',
        create: 'Erstellen',
        done: 'Fertig',
        copy: 'Kopieren',
        copied: 'Kopiert.',
        copiedWithLabel: '{{label}} kopiert.',
        show: 'Anzeigen',
        hide: 'Ausblenden',
        tryAgain: 'Erneut versuchen',
        addKey: 'Schlüssel hinzufügen',
        close: 'Schließen',
        none: 'Keine',
        all: 'Alle',
        unknown: 'Unbekannt',
        pageNotFound: 'Seite nicht gefunden',
        closeNotification: 'Benachrichtigung schließen',
        beta: 'Beta',
        brandName: 'ClawHost',
        brandNameGo: 'ClawHost Go',
        brandNameGoVersion: 'ClawHost Go {{version}}',
        menuFile: 'Ablage',
        menuEdit: 'Bearbeiten',
        menuView: 'Darstellung',
        menuWindow: 'Fenster',
        menuHelp: 'Hilfe',
        legalEmail: 'legal@clawhost.cloud',
        scrollToBottom: 'Nach unten scrollen',
        second: 'Sekunde',
        seconds: 'Sekunden'
    },
    setup: {
        welcomeTitle: 'Willkommen bei ClawHost Go',
        welcomeDescription: 'Richte dein Profil ein, um loszulegen.',
        whatsYourName: 'Wie heißt du?',
        namePlaceholder: 'Gib deinen Namen ein',
        nameHint: 'Du kannst es jederzeit später festlegen.',
        getStarted: 'Loslegen'
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
        switchLanguage: 'Sprache'
    },
    theme: {
        light: 'Hell',
        dark: 'Dunkel',
        system: 'System',
        toggleTheme: 'Design wechseln'
    },
    nav: {
        claws: 'Claws',
        playground: 'Playground',
        sshKeys: 'SSH-Schlüssel',
        account: 'Konto',
        billing: 'Abrechnung',
        license: 'Lizenz',
        signOut: 'Abmelden',
        admin: 'Admin',
        login: 'Anmelden',
        deploy: 'Deployen',
        deployOpenClaw: 'OpenClaw deployen',
        mainNavigation: 'Hauptnavigation',
        footerNavigation: 'Fusszeilen-Navigation',
        toggleMenu: 'Menu umschalten',
        cloud: 'Cloud',
        cloudSubtitle: 'Technisch',
        go: 'Go',
        goSubtitle: 'Nicht-technisch'
    },
    go: {
        pageTitle: 'ClawHost Go',
        heroTitle1: 'OpenClaw bereitstellen.',
        heroTitle2: 'Lokal. Sofort.',
        badge: 'Demnächst verfügbar',
        comingSoon: 'Demnächst verfügbar',
        description:
            'Ein leichtgewichtiger Desktop-Client zur Verwaltung Ihrer OpenClaw-Instanzen. Bereitstellen, überwachen und steuern Sie Ihre Claws — direkt von Ihrem Rechner.',
        download: 'Herunterladen für {{os}}',
        downloadWindows: 'Windows',
        downloadMac: 'macOS',
        selfHostInstead: 'Stattdessen selbst hosten',
        features: 'Funktionen',
        whyClawHostGo: 'Alles-in-einem-Funktionen',
        featuresDescription:
            'Warum es sich lohnt – Funktionen sprechen für sich.',
        zeroConfigDescription:
            'Installieren und starten. Keine Server- oder Cloud-Konfiguration. OpenClaw ist in Sekunden bereit.',
        ownedDataDescription:
            'Alles läuft auf Ihrem Gerät. Keine Cloud-Server, keine Drittanbieter, keine Daten verlassen Ihren Rechner.',
        terminalAccessDescription:
            'Greifen Sie direkt aus der App auf das Terminal Ihrer OpenClaw-Instanz zu. Kein externer SSH-Client erforderlich.',
        simplePricing: 'Einfache Preise',
        simplePricingDescription:
            'Eine Lizenz, alles unbegrenzt. Keine monatlichen Rechnungen, keine Nutzungslimits, keine versteckten Gebühren.',
        localDomain: 'Benutzerdefinierte lokale Domain',
        localDomainDescription:
            'Greifen Sie über eine benutzerdefinierte lokale Domain auf Ihr OpenClaw zu. Saubere URLs in Ihrem eigenen Netzwerk.',
        secureDescription:
            'Ihre Daten verlassen niemals Ihr Gerät. Vollständig isoliert, vollständig verschlüsselt, vollständig Ihres.',
        pricing: 'Preise',
        pricingTitle: 'Einfacher Einmalpreis',
        pricingDescription:
            'Keine Abonnements, keine versteckten Gebühren. Eine Lizenz, unbegrenzte Nutzung.',
        pricingPrice: '{{price}} $',
        pricingLabel: 'Einmalzahlung',
        pricingFeature1: 'Lebenslange Lizenz',
        pricingFeature2: 'Unbegrenzte Claws',
        pricingFeature3: 'Alle zukünftigen Updates',
        pricingFeature4: 'Keine Nutzungslimits',
        pricingFeature5: 'Prioritäts-Support',
        pricingFeature6: 'Benutzerdefinierte lokale Domain',
        pricingCta: 'ClawHost Go holen',
        comparison: 'Vergleich',
        comparisonTitle: 'Go vs Cloud',
        comparisonDescription:
            'Wählen Sie, was für Sie funktioniert. Go läuft lokal, Cloud auf dedizierten Servern.',
        comparisonLocalUs: 'Läuft vollständig auf Ihrem Gerät',
        comparisonLocalOthers: 'Läuft auf Remote-Servern',
        comparisonPricingUs: 'Einmalzahlung',
        comparisonPricingOthers: 'Monatliches Abonnement',
        comparisonDataUs: 'Daten bleiben auf Ihrem Gerät',
        comparisonDataOthers: 'Daten auf Cloud-Servern',
        comparisonSetupUs: 'Installieren und sofort starten',
        comparisonSetupOthers: 'Mit einem Klick bereitstellen',
        comparisonUpdatesUs: 'Automatische Updates',
        comparisonUpdatesOthers: 'Automatische Updates',
        comparisonAgentsUs: 'Mehrere Agenten',
        comparisonAgentsOthers: 'Mehrere Agenten',
        faqTitle: 'Fragen',
        faqHeading: 'Häufige Fragen',
        faqDescription: 'Alles, was Sie über ClawHost Go wissen müssen.',
        faq1Question: 'Was ist ClawHost Go?',
        faq1Answer:
            'ClawHost Go ist eine leichtgewichtige Desktop-Anwendung, mit der Sie OpenClaw lokal auf Ihrem Gerät ausführen können. Keine Cloud-Server nötig — installieren, starten und OpenClaw in Sekunden nutzen.',
        faq2Question: 'Wie unterscheidet sich Go von ClawHost Cloud?',
        faq2Answer:
            'ClawHost Cloud stellt OpenClaw auf dedizierten Remote-Servern mit 24/7-Verfügbarkeit und globalem Zugriff bereit. ClawHost Go führt alles lokal auf Ihrem Gerät aus — ideal für Datenschutz, Offline-Nutzung und einfache Setups.',
        faq3Question: 'Brauche ich eine Internetverbindung?',
        faq3Answer:
            'ClawHost Go funktioniert offline für lokale Nutzung. Eine Internetverbindung wird nur für die Ersteinrichtung, Updates und Funktionen benötigt, die externe API-Aufrufe erfordern.',
        faq4Question: 'Ist die Lizenz eine Einmalzahlung?',
        faq4Answer:
            'Ja. Sie zahlen einmal und erhalten lebenslangen Zugang zu ClawHost Go, einschließlich aller zukünftigen Updates. Keine Abonnements, keine wiederkehrenden Gebühren.',
        faq5Question: 'Welche Betriebssysteme werden unterstützt?',
        faq5Answer:
            'ClawHost Go unterstützt Windows und macOS. Beide Plattformen erhalten die gleichen Funktionen und Updates gleichzeitig.',
        faq6Question: 'Kann ich später von Go zu Cloud wechseln?',
        faq6Answer:
            'Absolut. Sie können Ihre OpenClaw-Konfiguration aus Go exportieren und jederzeit auf ClawHost Cloud bereitstellen. Beide Plattformen sind vollständig kompatibel.',
        statsPrice: '{{price}} $',
        statsLifetime: 'Lebenslang',
        statsOneTime: 'Einmalig',
        statsPayment: 'Zahlung',
        statsLocal: 'Lokal',
        statsLocally: 'Läuft lokal',
        statsZero: 'Null',
        statsZeroConfig: 'Null Konfiguration',
        ctaTitle: 'OpenClaw lokal ausführen',
        ctaDescription:
            'Einmalige Zahlung, lebenslange Lizenz. Stellen Sie OpenClaw auf Ihrem eigenen Gerät bereit — kein Cloud, keine Abonnements, keine Grenzen. Ihre Daten, Ihre Regeln.',
        ctaButton: 'ClawHost Go holen',
        joinWaitlist: 'Warteliste beitreten',
        joinedWaitlist: 'Auf der Warteliste',
        waitlistJoinedToast: 'Sie sind der Warteliste beigetreten.',
        waitlistAlreadyJoinedToast: 'Diese E-Mail ist bereits auf der Liste.',
        waitlistFailedToast: 'Beitritt zur Warteliste fehlgeschlagen!',
        waitlistEmailPlaceholder: 'E-Mail eingeben',
        updateAvailable: 'Version {{version}} ist verfügbar.',
        updateDownload: 'Herunterladen',
        updateDismiss: 'Später',
        clawNotFound: 'Claw nicht gefunden!',
        invalidClawName:
            'Ungültiger Claw-Name. Verwende nur Buchstaben, Zahlen und Bindestriche!',
        clawNameAlreadyExists: 'Ein Claw mit diesem Namen existiert bereits!',
        invalidSubdomain:
            'Ungültige Subdomain. Verwende 3-20 Kleinbuchstaben und Zahlen!',
        subdomainAlreadyInUse: 'Diese Subdomain wird bereits verwendet!',
        clawDirectoryNotFound: 'Claw-Verzeichnis nicht gefunden!',
        noVersionInstalled:
            'Keine OpenClaw-Version installiert. Gehe zum Tab Versionen und installiere zuerst eine!',
        failedToStartClaw: 'Claw konnte nicht gestartet werden!',
        noVersionAssigned: 'Keine OpenClaw-Version diesem Claw zugewiesen!',
        invalidAgentName: 'Ungültiger Agentenname!',
        agentNameAlreadyExists: 'Ein Agent mit diesem Namen existiert bereits!',
        invalidPath: 'Ungültiger Pfad!',
        fileNotFound: 'Datei nicht gefunden!',
        purchasingNotAvailable: 'Kauf ist im lokalen Modus nicht verfügbar!',
        exportFailed: 'Export fehlgeschlagen!',
        versionNotInstalled:
            'OpenClaw Version {{version}} ist nicht installiert!',
        failedToStartProcess:
            'Prozess konnte nicht gestartet werden: {{reason}}!',
        processExitedImmediately:
            'Prozess wurde sofort beendet. Logs:\n{{logs}}',
        processExitedImmediatelyNoLogs:
            'Prozess wurde sofort nach dem Start beendet!',
        processExitedWithCode:
            'Prozess wurde mit Code {{code}} beendet. Logs:\n{{logs}}',
        processExitedWithCodeNoLogs: 'Prozess wurde mit Code {{code}} beendet!',
        processExitedUnexpectedly: 'Prozess wurde unerwartet beendet!',
        failedToInstallVersion:
            'Installation von OpenClaw {{version}} fehlgeschlagen: {{reason}}!',
        oauthCancelled: 'Authentifizierung abgebrochen!',
        diskFull: 'Kein Speicherplatz mehr auf dem Gerät!',
        permissionDenied: 'Zugriff verweigert!',
        networkTimeout: 'Netzwerkanfrage ist abgelaufen!'
    },
    footer: {
        website: 'Webseite',
        copyrightName: 'ClawHost',
        copyrightRights: 'Alle Rechte vorbehalten.',
        termsOfService: 'Nutzungsbedingungen',
        privacyPolicy: 'Datenschutzerklärung',
        getInTouch: 'Kontakt',
        brandDescription:
            'Stelle OpenClaw mit einem Klick auf deinem eigenen VPS bereit. Volle Privatsphäre, dedizierte Ressourcen, keine geteilte Infrastruktur.',
        builtBy: 'Entwickelt von',
        supportedBy: 'Unterstützt von',
        product: 'Produkt',
        howItWorks: 'Ablauf',
        features: 'Funktionen',
        pricing: 'Preise',
        faq: 'Fragen',
        blog: 'Blog',
        changelog: 'Änderungsprotokoll',
        compare: 'Vollständiger Vergleich',
        legalAndMore: 'Sonstiges',
        documentation: 'Dokumentation',
        productDescription:
            'OpenClaw-Agenten in der Cloud oder lokal mit einem Klick bereitstellen – erstelle, verbinde und skaliere deine KI-Agenten schneller mit ClawHost.',
        downloadAndroid: 'Jetzt bei Google Play',
        downloadIos: 'Laden im App Store',
        ariaGithub: 'GitHub',
        ariaX: 'X',
        ariaFacebook: 'Facebook',
        ariaInstagram: 'Instagram',
        ariaThreads: 'Threads',
        ariaYoutube: 'YouTube',
        ariaTiktok: 'TikTok'
    },
    errors: {
        somethingWentWrong: 'Etwas ist schiefgelaufen!',
        couldNotLoadData:
            'Die Daten konnten nicht geladen werden. Bitte versuche es erneut!',
        notFound: 'Seite nicht gefunden!',
        pageNotFoundDescription:
            'Die gesuchte Seite existiert nicht oder wurde verschoben.',
        goToHomepage: 'Zur Startseite',
        failedToLoadClaws: 'Claws konnten nicht geladen werden!',
        failedToLoadClawsDescription:
            'Deine Claws konnten nicht geladen werden. Bitte überprüfe deine Verbindung und versuche es erneut!',
        failedToLoadSSHKeys: 'SSH-Schlüssel konnten nicht geladen werden!',
        failedToLoadSSHKeysDescription:
            'Deine SSH-Schlüssel konnten nicht geladen werden. Bitte überprüfe deine Verbindung und versuche es erneut!',
        failedToUpdateProfile: 'Profil konnte nicht aktualisiert werden!',
        failedToAddSSHKey: 'SSH-Schlüssel konnte nicht hinzugefügt werden!',
        failedToCreateClaw: 'Claw konnte nicht erstellt werden!',
        failedToLoadLocations:
            'Standorte konnten nicht geladen werden. Bitte versuche es erneut!',
        failedToLoadPlans:
            'Pläne konnten nicht geladen werden. Bitte versuche es erneut!',
        invalidPlan: 'Ungültiger Plan ausgewählt!',
        invalidLocation: 'Bitte wähle einen Standort!',
        failedToGenerateKeyPair:
            'Schlüsselpaar konnte nicht generiert werden. Bitte generiere die Schlüssel lokal!',
        unableToLoadPricing:
            'Preise konnten nicht geladen werden. Bitte versuche es später erneut!',
        noPasswordAvailable: 'Kein Passwort für diesen Claw verfügbar!',
        clawLimitReached:
            'Du hast das Limit von {{max}} Claws erreicht. Bitte kontaktiere den Support, um dieses Limit zu erhöhen!',
        sshKeyLimitReached:
            'Du hast das Limit von {{max}} SSH-Schlüsseln erreicht. Bitte kontaktiere den Support, um dieses Limit zu erhöhen!'
    },
    api: {
        missingRequiredFields: 'Pflichtfelder fehlen!',
        clawNotFound: 'Claw nicht gefunden!',
        clawRenamed: 'Claw erfolgreich umbenannt.',
        invalidClawName:
            'Der Claw-Name muss zwischen 1 und {{max}} Zeichen lang sein!',
        userNotFound: 'Benutzer nicht gefunden!',
        sshKeyNotFound: 'SSH-Schlüssel nicht gefunden!',
        pendingClawNotFound: 'Ausstehender Claw nicht gefunden!',
        clawNotScheduledForDeletion: 'Claw ist nicht zur Löschung vorgemerkt!',
        clawLimitReached:
            'Du hast das Limit von {{max}} Claws erreicht. Bitte kontaktiere den Support, um dieses Limit zu erhöhen!',
        sshKeyLimitReached:
            'Du hast das Limit von {{max}} SSH-Schlüsseln erreicht. Bitte kontaktiere den Support, um dieses Limit zu erhöhen!',
        volumeSizeInvalid:
            'Die Volumengröße muss zwischen {{min}} und {{max}} GB liegen!',
        paymentNotConfigured: 'Zahlung ist für diesen Plan nicht konfiguriert!',
        invalidSshKeyFormat: 'Ungültiges SSH-Public-Key-Format!',
        sshKeyInUse:
            'Dieser SSH-Schlüssel wird derzeit von einem oder mehreren Claws verwendet!',
        inputTooLong: 'Eingabe überschreitet die maximal zulässige Länge!',
        invalidEnvVars: 'Ungültige Umgebungsvariablennamen oder -werte!',
        invalidEmailFormat: 'Ungültiges E-Mail-Format!',
        plusAddressingNotAllowed:
            'Plus-Adressierung ist für die E-Mail-Anmeldung nicht erlaubt!',
        invalidRedirectUrl: 'Ungültige Weiterleitungs-URL!',
        fileTooLarge: 'Dateiinhalt überschreitet die maximal zulässige Größe!',
        nameAndKeyRequired:
            'Name und öffentlicher Schlüssel sind erforderlich!',
        nameTooLong: 'Der Name darf maximal {{max}} Zeichen lang sein!',
        noBillingAccount: 'Kein Abrechnungskonto gefunden!',
        orderIdRequired: 'Bestell-ID ist erforderlich!',
        orderNotFound: 'Bestellung nicht gefunden!',
        emailRequired: 'E-Mail ist erforderlich!',
        redirectUrlRequired: 'Weiterleitungs-URL ist erforderlich!',
        invalidWebhook: 'Ungültiger Webhook!',
        failedToStartClaw: 'Claw konnte nicht gestartet werden!',
        failedToStopClaw: 'Claw konnte nicht gestoppt werden!',
        failedToRestartClaw: 'Claw konnte nicht neu gestartet werden!',
        failedToDeleteClaw: 'Claw konnte nicht gelöscht werden!',
        failedToCreateClaw: 'Claw konnte nicht erstellt werden!',
        invalidProvider: 'Ungültiger Anbieter!',
        providerNotAllowed:
            'Dieser Anbieter ist nicht verfügbar, wenn Hetzner aktiv ist!',
        invalidPlan: 'Ungültiger Plan ausgewählt!',
        planBelowMinimumMemory:
            'Dieser Plan erfüllt nicht die Mindestanforderung an Arbeitsspeicher!',
        invalidLocation: 'Ungültiger Standort ausgewählt!',
        planNotAvailableAtLocation:
            'Dieser Plan ist am ausgewählten Standort nicht verfügbar!',
        failedToSyncClaw: 'Serverstatus konnte nicht synchronisiert werden!',
        failedToProvisionClaw: 'Claw konnte nicht bereitgestellt werden!',
        failedToInitiatePurchase: 'Kauf konnte nicht eingeleitet werden!',
        failedToCancelDeletion: 'Löschung konnte nicht abgebrochen werden!',
        failedToHardDeleteClaw: 'Claw konnte nicht endgültig gelöscht werden!',
        failedToCancelScheduledDeletion:
            'Die geplante Löschung konnte nicht abgebrochen werden!',
        failedToCreateSshKey: 'SSH-Schlüssel konnte nicht erstellt werden!',
        failedToDeleteSshKey: 'SSH-Schlüssel konnte nicht gelöscht werden!',
        failedToUpdateProfile: 'Profil konnte nicht aktualisiert werden!',
        failedToGetProfile: 'Profil konnte nicht abgerufen werden!',
        failedToGetInvoice: 'Rechnung konnte nicht abgerufen werden!',
        failedToGetCustomerPortal:
            'Kundenportal konnte nicht abgerufen werden!',
        failedToGetBillingHistory:
            'Abrechnungsverlauf konnte nicht abgerufen werden!',
        failedToGetStats: 'Statistiken konnten nicht abgerufen werden!',
        failedToFetchLocations: 'Standorte konnten nicht abgerufen werden!',
        failedToFetchPlans: 'Pläne konnten nicht abgerufen werden!',
        failedToFetchVolumePricing:
            'Volumenpreise konnten nicht abgerufen werden!',
        failedToFetchPlanAvailability:
            'Planverfügbarkeit konnte nicht abgerufen werden!',
        failedToSendEmail: 'E-Mail konnte nicht gesendet werden!',
        failedToGetVersion: 'Version konnte nicht abgerufen werden!',
        failedToGetVersions: 'Versionen konnten nicht abgerufen werden!',
        failedToInstallVersion: 'Version konnte nicht installiert werden!',
        installVersionSuccess: 'Version erfolgreich installiert.',
        invalidVersion: 'Ungültiges Versionsformat!',
        outdatedVersion:
            'Diese Version ist veraltet und kann nicht installiert werden!',
        failedToGetDiagnostics: 'Verbindung zur Instanz fehlgeschlagen!',
        failedToGetDiagnosticsDescription:
            'Diagnose konnte nicht abgerufen werden. Die Instanz ist möglicherweise offline oder wird gestartet!',
        failedToGetLogs: 'Logs konnten nicht geladen werden!',
        failedToGetLogsDescription:
            'Logs für diese Instanz konnten nicht abgerufen werden. Bitte versuche es später erneut!',
        failedToRepairClaw: 'Instanz konnte nicht repariert werden!',
        repairSuccess: 'Instanz erfolgreich repariert.',
        repairGatewayNotResponding:
            'Reparatur durchgeführt, aber das Gateway antwortet noch nicht. Es benötigt möglicherweise mehr Zeit zum Starten!',
        failedToReinstallClaw: 'Instanz konnte nicht neu installiert werden!',
        reinstallSuccess: 'Instanz erfolgreich neu installiert.',
        reinstallRateLimited:
            'Du kannst nur einmal alle 24 Stunden neu installieren. Kontaktiere das Team, falls du dieses Limit aufheben möchtest.',
        clawBusy: 'Claw wird derzeit bereitgestellt oder gelöscht!',
        reinstallGatewayNotResponding:
            'Neuinstallation abgeschlossen, aber das Gateway antwortet noch nicht. Es benötigt möglicherweise mehr Zeit zum Starten!',
        failedToExportClaw: 'Claw-Daten konnten nicht exportiert werden!',
        clawNotReady: 'Claw ist nicht bereit für den Export!',
        exportRateLimited:
            'Dieser Claw wurde kürzlich exportiert. Bitte warte, bevor du erneut exportierst!',
        failedToListFiles: 'Instanzdateien konnten nicht aufgelistet werden!',
        failedToReadFile: 'Datei konnte nicht gelesen werden!',
        failedToUpdateFile: 'Datei konnte nicht gespeichert werden!',
        invalidFilePath: 'Ungültiger Dateipfad!',
        fileNotEditable: 'Dieser Dateityp kann nicht bearbeitet werden!',
        invalidJsonConfig: 'Ungültiges JSON!',
        fileSaveSuccess: 'Datei gespeichert.',
        rateLimitExceeded: 'Bitte warte, bevor du einen neuen Code anforderst!',
        otpExpiredOrNotFound:
            'Code abgelaufen oder nicht gefunden. Bitte fordere einen neuen an!',
        otpMaxAttemptsReached:
            'Zu viele fehlgeschlagene Versuche. Bitte fordere einen neuen Code an!',
        otpInvalidCode: 'Ungültiger Code. Bitte versuche es erneut!',
        licenseAlreadyPurchased: 'Lizenz bereits erworben!',
        licenseNotAvailable: 'Das Lizenzprodukt ist nicht verfügbar!',
        licenseCheckoutCreated: 'Lizenzkauf erstellt.',
        failedToPurchaseLicense: 'Lizenzkauf konnte nicht erstellt werden!',
        internalServerError: 'Ein interner Fehler ist aufgetreten!',
        invalidCredentials: 'Ungültige Anmeldedaten!',
        accountLinked: 'Konto erfolgreich verknüpft.',
        webhookProcessingFailed: 'Webhook-Verarbeitung fehlgeschlagen!',
        adminAccessDenied: 'Administratorzugang erforderlich!',
        clawsFetched: 'Claws erfolgreich abgerufen.',
        clawFetched: 'Claw erfolgreich abgerufen.',
        clawSynced: 'Claw erfolgreich synchronisiert.',
        clawStarted: 'Claw erfolgreich gestartet.',
        clawStopped: 'Claw erfolgreich gestoppt.',
        clawRestarted: 'Claw erfolgreich neu gestartet.',
        clawCreated: 'Claw erfolgreich erstellt.',
        clawDeleted: 'Claw erfolgreich gelöscht.',
        clawDeletionScheduled: 'Claw-Löschung geplant.',
        clawDeletionCancelled: 'Claw-Löschung abgebrochen.',
        clawHardDeleted: 'Claw endgültig gelöscht.',
        pendingClawCancelled: 'Kauf abgebrochen.',
        failedToCancelPendingClaw: 'Kauf konnte nicht abgebrochen werden!',
        clawPurchaseInitiated: 'Kauf erfolgreich eingeleitet.',
        sshKeysFetched: 'SSH-Schlüssel erfolgreich abgerufen.',
        sshKeyCreated: 'SSH-Schlüssel erfolgreich erstellt.',
        sshKeyDeleted: 'SSH-Schlüssel erfolgreich gelöscht.',
        profileFetched: 'Profil erfolgreich abgerufen.',
        profileUpdated: 'Profil erfolgreich aktualisiert.',
        statsFetched: 'Statistiken erfolgreich abgerufen.',
        billingHistoryFetched: 'Abrechnungsverlauf erfolgreich abgerufen.',
        invoiceFetched: 'Rechnung erfolgreich abgerufen.',
        customerPortalFetched: 'Kundenportal-URL erfolgreich abgerufen.',
        plansFetched: 'Pläne erfolgreich abgerufen.',
        locationsFetched: 'Standorte erfolgreich abgerufen.',
        volumePricingFetched: 'Volumenpreise erfolgreich abgerufen.',
        planAvailabilityFetched: 'Planverfügbarkeit erfolgreich abgerufen.',
        agentsFetched: 'Agenten erfolgreich abgerufen.',
        agentsFetchFailed:
            'Instanz konnte nicht erreicht werden, um Agenten abzurufen!',
        agentConfigFetched: 'Agentenkonfiguration erfolgreich abgerufen.',
        agentConfigUpdated: 'Agentenkonfiguration erfolgreich aktualisiert.',
        agentConfigUpdateFailed:
            'Agentenkonfiguration konnte nicht aktualisiert werden!',
        agentCreated: 'Agent erfolgreich erstellt.',
        agentCreateFailed:
            'Agent konnte auf der Instanz nicht erstellt werden!',
        agentDeleted: 'Agent erfolgreich gelöscht.',
        agentDeleteFailed:
            'Agent konnte von der Instanz nicht gelöscht werden!',
        cannotDeleteMainAgent:
            'Der letzte verbleibende Agent kann nicht gelöscht werden!',
        agentNameInvalid:
            'Agentenname darf nur Buchstaben, Zahlen und Bindestriche enthalten!',
        agentNameDuplicate: 'Ein Agent mit diesem Namen existiert bereits!',
        diagnosticsFetched: 'Diagnose erfolgreich abgerufen.',
        logsFetched: 'Logs erfolgreich abgerufen.',
        filesFetched: 'Dateien erfolgreich abgerufen.',
        fileFetched: 'Datei erfolgreich abgerufen.',
        otpSent: 'Code erfolgreich gesendet.',
        otpVerified: 'Code erfolgreich verifiziert.',
        webhookReceived: 'Webhook empfangen.',
        unauthorized: 'Nicht autorisiert!',
        invalidToken: 'Ungültiges Token!',
        notFound: 'Nicht gefunden!',
        healthOk: 'API läuft.',
        channelsFetched: 'Kanäle erfolgreich abgerufen.',
        channelsUpdated: 'Kanäle erfolgreich aktualisiert.',
        channelsUpdateFailed: 'Kanäle konnten nicht aktualisiert werden!',
        channelsFetchFailed: 'Kanäle konnten nicht abgerufen werden!',
        channelMissingRequired: 'Pflichtfelder für aktivierten Kanal fehlen!',
        whatsappPairStarted: 'WhatsApp-Kopplung gestartet.',
        whatsappPairFailed: 'WhatsApp-Kopplung fehlgeschlagen!',
        whatsappAlreadyPaired: 'WhatsApp ist bereits gekoppelt!',
        whatsappVersionUnsupported:
            'Diese Version unterstützt die Kanalkonfiguration über das Dashboard nicht. Verwenden Sie den Terminal-Tab zur manuellen Konfiguration oder aktualisieren Sie OpenClaw.',
        bindingsFetched: 'Bindungen erfolgreich abgerufen.',
        bindingsFetchFailed: 'Bindungen konnten nicht abgerufen werden!',
        bindingsUpdated: 'Bindungen erfolgreich aktualisiert.',
        bindingsUpdateFailed: 'Bindungen konnten nicht aktualisiert werden!',
        bindingsInvalidFormat: 'Ungültiges Bindungsformat!',
        bindingsInvalidChannel: 'Nicht unterstützter Kanal in der Bindung!',
        bindingsDuplicateChannel:
            'Ein Kanal kann nur einem Agenten zugewiesen werden!',
        skillsFetched: 'Skills erfolgreich abgerufen.',
        skillsUpdated: 'Skills erfolgreich aktualisiert.',
        skillsUpdateFailed: 'Skills konnten nicht aktualisiert werden!',
        skillsFetchFailed: 'Skills konnten nicht abgerufen werden!',
        agentSkillsFetched: 'Agenten-Skills erfolgreich abgerufen.',
        agentSkillsUpdated: 'Agenten-Skills erfolgreich aktualisiert.',
        agentSkillsUpdateFailed:
            'Agenten-Skills konnten nicht aktualisiert werden!',
        agentSkillsFetchFailed:
            'Agenten-Skills konnten nicht abgerufen werden!',
        invalidSkillName:
            'Skill-Name darf nur Buchstaben, Zahlen, Bindestriche und Unterstriche enthalten!',
        skillNotFound: 'Skill nicht gefunden!',
        clawHubSearchSuccess: 'ClawHub-Suche abgeschlossen.',
        clawHubSearchFailed: 'ClawHub konnte nicht durchsucht werden!',
        clawHubFetched: 'ClawHub-Skills abgerufen.',
        clawHubFetchFailed: 'ClawHub-Skills konnten nicht abgerufen werden!',
        clawHubInstalled: 'Skill von ClawHub installiert.',
        clawHubInstallFailed:
            'Skill von ClawHub konnte nicht installiert werden!',
        clawHubRemoved: 'ClawHub-Skill entfernt.',
        clawHubRemoveFailed: 'ClawHub-Skill konnte nicht entfernt werden!',
        clawHubUpdated: 'Skill aktualisiert.',
        clawHubUpdateFailed: 'ClawHub-Skill konnte nicht aktualisiert werden!',
        clawHubUpdatesFetched: 'Update-Prüfung abgeschlossen.',
        clawHubUpdatesFailed: 'Updates konnten nicht geprüft werden!',
        invalidAuthMethod: 'Ungültige Authentifizierungsmethode!',
        authMethodNotConnected:
            'Diese Authentifizierungsmethode ist nicht verbunden!',
        authMethodConnected: 'Authentifizierungsmethode erfolgreich verbunden.',
        authMethodDisconnected:
            'Authentifizierungsmethode erfolgreich getrennt.',
        failedToConnectAuthMethod:
            'Authentifizierungsmethode konnte nicht verbunden werden!',
        failedToDisconnectAuthMethod:
            'Authentifizierungsmethode konnte nicht getrennt werden!',
        textRequired: 'Text ist erforderlich!',
        voiceNotFound: 'Stimmmodell nicht gefunden!',
        ttsGenerationFailed: 'Sprachgenerierung fehlgeschlagen!',
        voicesFetched: 'Stimmen erfolgreich abgerufen.',
        featureEmailsSent: 'Feature-E-Mails erfolgreich gesendet.',
        featureEmailsFailed: 'Fehler beim Senden der Feature-E-Mails!',
        invalidFeatureKey: 'Ungültiger Feature-Schlüssel!',
        waitlistJoined: 'Erfolgreich der Warteliste beigetreten.',
        waitlistAlreadyJoined: 'Bereits auf der Warteliste.',
        waitlistJoinFailed: 'Beitritt zur Warteliste fehlgeschlagen!',
        waitlistRateLimited:
            'Du bist zu schnell! Bitte versuche es in {{seconds}} {{unit}} erneut.',
        waitlistStatusFetched: 'Wartelisten-Status abgerufen.',
        waitlistCheckFailed: 'Fehler beim Überprüfen des Wartelisten-Status!'
    },
    emails: {
        otpSubject: 'Dein ClawHost-Anmeldecode',
        otpPreview: 'Dein ClawHost-Anmeldecode: {{code}}',
        otpHeading: 'Dein Anmeldecode lautet:',
        otpExpiry:
            'Der Code läuft in 10 Minuten ab. Falls du das nicht warst, ignoriere diese E-Mail.',
        changelogSubject: 'Neuigkeiten bei ClawHost',
        changelogPreview:
            'Entdecke die neuesten Updates von ClawHost: {{title}}',
        changelogHeading: 'Neuigkeiten',
        changelogButton: 'Changelog anzeigen',
        changelogVisitButton: 'ClawHost besuchen',
        changelogFooter:
            'Du erhältst diese E-Mail, weil du ein ClawHost-Konto hast.',
        featureFooter:
            'Du erhältst diese E-Mail, weil du ein ClawHost-Konto hast.',
        features: {
            terminal: {
                subject: 'Wusstest du schon? Du hast ein Web-Terminal',
                preview: 'Greife direkt über den Browser auf deinen Server zu',
                heading: 'Dein Server ist nur einen Klick entfernt',
                description:
                    'Greife direkt über deinen Browser auf deinen Server zu — mit unserem integrierten Terminal. Kein SSH-Client nötig — öffne einfach ClawHost und tippe los.',
                cta: 'Terminal öffnen'
            },
            logs: {
                subject: 'Wusstest du schon? Echtzeit-Logs in deinem Dashboard',
                preview: 'Überwache die Logs deines Servers direkt im Browser',
                heading: 'Sieh, was dein Server macht',
                description:
                    'Überwache die Logs deines Servers in Echtzeit über das ClawHost-Dashboard. Diagnostiziere Probleme, verfolge Deployments und debugge deine Anwendungen — alles im Browser.',
                cta: 'Logs anzeigen'
            },
            channels: {
                subject:
                    'Wusstest du schon? Verbinde Agenten mit Discord, Slack & mehr',
                preview: 'Verknüpfe deine KI-Agenten mit Kommunikationskanälen',
                heading: 'Deine Agenten, überall',
                description:
                    'Verbinde deine KI-Agenten mit Discord, Slack, WhatsApp und mehr. Konfiguriere Kanäle und verknüpfe sie mit Agenten — alles über das ClawHost-Dashboard.',
                cta: 'Kanäle einrichten'
            },
            fileExplorer: {
                subject:
                    'Wusstest du schon? Bearbeite Server-Dateien im Browser',
                preview: 'Durchsuche, lese und bearbeite Dateien ohne SSH',
                heading: 'Deine Dateien, griffbereit',
                description:
                    'Durchsuche, lese und bearbeite die Dateien deines Servers direkt im ClawHost-Dashboard. Syntax-Hervorhebung, Suche und sofortiges Speichern — ohne SSH.',
                cta: 'Datei-Explorer öffnen'
            },
            playground: {
                subject: 'Wusstest du schon? Visualisiere deine Infrastruktur',
                preview:
                    'Sieh deine Claws und Agenten auf einem interaktiven Canvas',
                heading: 'Sieh das große Ganze',
                description:
                    'Der Playground bietet dir ein interaktives Canvas mit all deinen Claws und Agenten. Klicke auf einen Knoten, um ihn zu verwalten — ein visuelles Kommandozentrum für deine Infrastruktur.',
                cta: 'Playground öffnen'
            },
            agentChat: {
                subject: 'Wusstest du schon? Chatte mit deinen KI-Agenten',
                preview: 'Sprich mit deinen Agenten direkt im Dashboard',
                heading: 'Sprich mit deinen Agenten',
                description:
                    'Chatte mit deinen KI-Agenten direkt im ClawHost-Dashboard. Sende Nachrichten, hänge Bilder an und sieh den Verlauf — alles an einem Ort.',
                cta: 'Chat starten'
            },
            voiceMode: {
                subject:
                    'Wusstest du schon? Sprich per Stimme mit deinen Agenten',
                preview: 'Nutze Spracherkennung mit deinen Agenten',
                heading: 'Sprich, statt zu tippen',
                description:
                    'Nutze den Sprachmodus, um freihändig mit deinen KI-Agenten zu sprechen. Spracherkennung für Eingaben, Sprachsynthese für Antworten — mit mehreren Stimmen zur Auswahl.',
                cta: 'Sprachmodus testen'
            },
            skills: {
                subject: 'Wusstest du schon? Über 5.000 Skills auf ClawHub',
                preview:
                    'Durchsuche und installiere Community-Skills mit einem Klick',
                heading: 'Erweitere deine Agenten sofort',
                description:
                    'Durchsuche über 5.000 fertige Skills auf ClawHub und installiere sie mit einem einzigen Klick. Websuche, Code-Ausführung, Bildgenerierung und vieles mehr.',
                cta: 'ClawHub durchsuchen'
            },
            bindings: {
                subject: 'Wusstest du schon? Binde Agenten an bestimmte Kanäle',
                preview: 'Bestimme, welcher Agent auf welchem Kanal antwortet',
                heading: 'Ein Agent pro Kanal',
                description:
                    'Binde bestimmte Agenten an bestimmte Kanäle. Dein Support-Agent auf Discord, dein Assistent auf WhatsApp — du entscheidest, wer wo antwortet.',
                cta: 'Bindungen konfigurieren'
            },
            envVars: {
                subject: 'Wusstest du schon? Umgebungsvariablen verwalten',
                preview: 'Setze API-Schlüssel und Konfiguration ohne SSH',
                heading: 'Konfiguriere ohne SSH',
                description:
                    'Füge Umgebungsvariablen direkt im ClawHost-Dashboard hinzu, bearbeite und lösche sie. API-Schlüssel, Secrets und Konfiguration — ohne Terminal.',
                cta: 'Variablen verwalten'
            },
            diagnostics: {
                subject: 'Wusstest du schon? Integrierte Gesundheitschecks',
                preview: 'Überwache die Servergesundheit im Dashboard',
                heading: 'Wisse, dass dein Server gesund ist',
                description:
                    'Führe Diagnosen auf deinem Claw durch, um Dienststatus, Speichernutzung und Portverfügbarkeit zu prüfen. Erkenne Probleme, bevor sie ernst werden.',
                cta: 'Diagnose starten'
            },
            sshKeys: {
                subject:
                    'Wusstest du schon? SSH-Schlüssel über ClawHost verwalten',
                preview:
                    'Generiere und verwalte SSH-Schlüsselpaare im Dashboard',
                heading: 'SSH-Schlüssel, vereinfacht',
                description:
                    'Generiere SSH-Schlüsselpaare, kopiere öffentliche Schlüssel und lade private Schlüssel herunter — alles im ClawHost-Dashboard. Weise Schlüssel deinen Claws für sicheren Zugang zu.',
                cta: 'SSH-Schlüssel verwalten'
            },
            exportConfig: {
                subject:
                    'Wusstest du schon? Exportiere deine Claw-Konfiguration',
                preview: 'Lade dein Setup als portable Datei herunter',
                heading: 'Nimm deine Konfiguration mit',
                description:
                    'Exportiere die Konfiguration und Einstellungen deines Claws als herunterladbare Datei. Sichere dein Setup oder nutze es, um deine Umgebung zu replizieren.',
                cta: 'Konfiguration exportieren'
            },
            multiLanguage: {
                subject: 'Wusstest du schon? ClawHost spricht deine Sprache',
                preview: 'Nutze ClawHost in 14 Sprachen',
                heading: 'ClawHost in deiner Sprache',
                description:
                    'Stelle das gesamte ClawHost-Dashboard auf eine von 14 Sprachen um. Von Buttons bis Fehlermeldungen — alles übersetzt.',
                cta: 'Sprache ändern'
            },
            subdomain: {
                subject:
                    'Wusstest du schon? Jeder Claw hat seine eigene Subdomain',
                preview:
                    'Greife von überall auf deinen Claw zu — mit einer eigenen URL',
                heading: 'Zugriff von überall',
                description:
                    'Jeder Claw erhält eine eigene Subdomain, um von überall auf deine OpenClaw-Instanz zuzugreifen. Kein Port-Forwarding, kein lokales Netzwerk — nur eine URL.',
                cta: 'Deine Subdomain ansehen'
            },
            darkMode: {
                subject: 'Wusstest du schon? ClawHost hat einen Dark Mode',
                preview: 'Wechsle zwischen hellem und dunklem Design',
                heading: 'Angenehm für die Augen',
                description:
                    'Wechsle zwischen hellem und dunklem Design im ClawHost-Dashboard. Deine Einstellung wird gespeichert und bei jedem Besuch automatisch angewendet.',
                cta: 'Dark Mode testen'
            },
            reinstall: {
                subject:
                    'Wusstest du schon? OpenClaw mit einem Klick neu installieren',
                preview:
                    'Setze deine OpenClaw-Instanz zurück, ohne den Server zu verlieren',
                heading: 'Neustart, gleicher Server',
                description:
                    'Installiere die OpenClaw-Runtime auf deinem bestehenden Server mit einem einzigen Klick neu. Dein Server bleibt intakt — nur OpenClaw bekommt eine saubere Installation.',
                cta: 'Mehr erfahren'
            },
            yearlyPlans: {
                subject: 'Wusstest du schon? Spare mit Jahresplänen',
                preview: 'Wechsle zu jährlicher Abrechnung und zahle weniger',
                heading: 'Weniger zahlen, mehr bekommen',
                description:
                    'Wechsle zur jährlichen Abrechnung und spare bei deinem Claw-Abo. Der gleiche großartige Service, günstigerer Preis — jederzeit kündbar.',
                cta: 'Pläne ansehen'
            }
        }
    },
    auth: {
        signIn: 'Anmelden',
        signInDescription:
            'Melde dich bei deinem ClawHost-Konto an, um deine OpenClaw-Instanzen zu verwalten.',
        signingIn: 'Anmeldung...',
        verifyCode: 'Code bestätigen',
        checkYourEmail: 'Prüfe deine E-Mail',
        checkYourEmailHeading: 'Prüfe deine E-Mail',
        codeSentTo: 'Wir haben einen 6-stelligen Code gesendet an',
        signInToDeployOpenClaw:
            'Melde dich an, um OpenClaw-Instanzen zu verwalten und bereitzustellen.',
        emailAddress: 'E-Mail-Adresse',
        emailPlaceholder: 'beispiel@clawhost.cloud',
        continueWithEmail: 'Weiter mit E-Mail',
        otpDescription:
            'Wir senden dir einen Code zum Anmelden. Kein Passwort nötig.',
        welcomeBack: 'Willkommen zurück.',
        resendIn: 'Erneut senden in {{seconds}}s',
        resendCode: 'Code erneut senden',
        changeEmail: 'E-Mail ändern',
        invalidCode: 'Ungültiger Code!',
        invalidEmailFormat: 'Bitte geben Sie eine gültige E-Mail-Adresse ein!',
        plusAddressingNotAllowed:
            'Plus-Adressierung ist für die E-Mail-Anmeldung nicht erlaubt!',
        or: 'oder',
        continueWithGoogle: 'Weiter mit Google',
        continueWithGithub: 'Weiter mit GitHub',
        agreementNotice: 'Durch Fortfahren stimmst du unseren',
        termsOfService: 'Nutzungsbedingungen',
        andWord: 'und',
        privacyPolicy: 'Datenschutzerklärung'
    },
    account: {
        title: 'Konto',
        description:
            'Verwalte deine ClawHost-Kontoeinstellungen und Profilinformationen.',
        accountSettings: 'Konto',
        manageYourAccount: 'Verwalte dein Profil und deine Kontoeinstellungen.',
        profileInformation: 'Profilinformationen',
        profileDescription: 'Deine persönlichen Daten und dein Anzeigename.',
        noNameSet: 'Kein Name festgelegt',
        joined: 'Beigetreten',
        claws: 'Claws',
        sshKeys: 'Schlüssel',
        displayName: 'Anzeigename',
        enterYourName: 'Gib deinen Namen ein',
        emailAddress: 'E-Mail-Adresse',
        emailNotEditable:
            'E-Mail kann nicht bearbeitet werden. Kontaktiere den Support.',
        profileUpdatedSuccessfully: 'Profil erfolgreich aktualisiert.',
        billingHistory: 'Abrechnungsverlauf',
        billingDescription: 'Dein Zahlungsverlauf und deine Rechnungen',
        date: 'Datum',
        product: 'Produkt',
        amount: 'Betrag',
        status: 'Status',
        statusPaid: 'Bezahlt',
        statusPending: 'Ausstehend',
        statusRefunded: 'Erstattet',
        statusPartiallyRefunded: 'Teilweise erstattet',
        billingReasonPurchase: 'Kauf',
        billingReasonSubscriptionCreate: 'Neues Abonnement',
        billingReasonSubscriptionCycle: 'Verlängerung',
        billingReasonSubscriptionUpdate: 'Abonnement-Änderung',
        noBillingHistory: 'Keine Abrechnungen',
        noBillingHistoryDescription:
            'Du hast keinen Zahlungsverlauf. Sobald du deinen ersten Claw bereitstellst, werden deine Abrechnungen hier angezeigt.',
        failedToLoadBilling: 'Abrechnungsverlauf konnte nicht geladen werden!',
        viewInvoice: 'Rechnung anzeigen',
        failedToLoadInvoice: 'Rechnung konnte nicht geladen werden!',
        couponApplied: 'Gutschein: {{name}}',
        manageBilling: 'Abrechnung verwalten',
        failedToLoadPortal: 'Abrechnungsportal konnte nicht geöffnet werden!',
        connectedAccounts: 'Verbundene Konten',
        connectedAccountsDescription:
            'Verwalte die mit deinem Konto verknüpften Anmeldemethoden.',
        authEmail: 'E-Mail',
        authGoogle: 'Google',
        authGithub: 'GitHub',
        authConnected: 'Verbunden',
        authConnect: 'Verbinden',
        authDisconnect: 'Trennen',
        emailCannotBeDisconnected:
            'E-Mail ist immer als primäre Anmeldemethode verbunden.',
        providerConnected: '{{provider}} erfolgreich verbunden.',
        providerDisconnected: '{{provider}} erfolgreich getrennt.',
        providerEmailMismatch:
            'Du kannst nur Konten verknüpfen, die dieselbe E-Mail-Adresse verwenden!',
        settings: 'Einstellungen',
        settingsDescription: 'Verwalte deine Dashboard-Einstellungen.',
        showAllClaws: 'Alle Claws aller Benutzer anzeigen',
        openLinksWindowed: 'Links in einer Fensteransicht öffnen',
        openLinksWindowedDescription:
            'Wenn aktiviert, werden externe Links in der App statt im Systembrowser geöffnet.'
    },
    billing: {
        title: 'Abrechnung',
        description:
            'Sieh deinen Zahlungsverlauf ein und verwalte deine Abrechnung.',
        billingHistory: 'Abrechnung',
        manageYourBilling:
            'Sieh deinen Zahlungsverlauf ein und verwalte Rechnungen.',
        billingDescription: 'Dein Zahlungsverlauf und deine Rechnungen',
        date: 'Datum',
        product: 'Produkt',
        amount: 'Betrag',
        status: 'Status',
        statusPaid: 'Bezahlt',
        statusPending: 'Ausstehend',
        statusRefunded: 'Erstattet',
        statusPartiallyRefunded: 'Teilweise erstattet',
        billingReasonPurchase: 'Kauf',
        billingReasonSubscriptionCreate: 'Neues Abonnement',
        billingReasonSubscriptionCycle: 'Verlängerung',
        billingReasonSubscriptionUpdate: 'Abonnement-Änderung',
        noBillingHistory: 'Keine Abrechnungen',
        noBillingHistoryDescription:
            'Du hast keinen Zahlungsverlauf. Sobald du deinen ersten Claw bereitstellst, werden deine Abrechnungen hier angezeigt.',
        failedToLoadBilling: 'Abrechnungsverlauf konnte nicht geladen werden!',
        failedToLoadBillingDescription:
            'Dein Abrechnungsverlauf konnte nicht geladen werden. Bitte überprüfe deine Verbindung und versuche es erneut!',
        viewInvoice: 'Rechnung anzeigen',
        failedToLoadInvoice: 'Rechnung konnte nicht geladen werden!',
        couponApplied: 'Gutschein: {{name}}',
        manageBilling: 'Abrechnung verwalten',
        failedToLoadPortal: 'Abrechnungsportal konnte nicht geöffnet werden!'
    },
    license: {
        title: 'Lizenz',
        description: 'Verwalte deine OpenClaw-Lizenz.',
        pageTitle: 'Lizenz',
        pageDescription:
            'Kaufe deine Lizenz für das lokale Self-Hosting von OpenClaw-Instanzen mit unserer Go-App.',
        planName: 'ClawHost Go Lizenz',
        oneTimePurchase: 'Einmalkauf',
        price: '{{price}} $',
        priceNote: 'Einmal zahlen, für immer besitzen.',
        purchaseLicense: 'Lizenz kaufen',
        purchasing: 'Weiterleitung...',
        activated: 'Lizenz aktiv',
        activatedDescription:
            'Deine Lizenz ist aktiv. Danke für deine Unterstützung.',
        paymentSuccess: 'Zahlung erfolgreich. Deine Lizenz ist jetzt aktiv.',
        failedToPurchase: 'Checkout konnte nicht gestartet werden!',
        featureUnlimitedClaws: 'Unbegrenzte OpenClaws',
        featureUnlimitedAgents: 'Unbegrenzte Agenten',
        featureDevices: 'Unbegrenzte Geräte',
        featureUpdates: 'Updates für immer',
        featureSupport: 'Prioritäts-Support',
        featureCloud: 'Alle Cloud-Funktionen, lokal',
        whatsIncluded: 'Was enthalten ist',
        permanentNote:
            'Lizenzen sind dauerhaft und unwiderruflich. Einmal gekauft, gehört sie dir für immer.',
        gateTitle: 'Lizenz erforderlich',
        gateDescription:
            'Du benötigst eine ClawHost Go Lizenz, um OpenClaw-Instanzen lokal bereitzustellen und zu verwalten.'
    },
    network: {
        unstable: 'Instabile Verbindung',
        unstableDescription:
            'Deine Internetverbindung ist instabil. Einige Funktionen funktionieren möglicherweise nicht wie erwartet.',
        offline: 'Keine Internetverbindung',
        offlineDescription:
            'Du bist derzeit offline. Funktionen, die Internetzugang erfordern, sind nicht verfügbar.',
        dismiss: 'Schließen'
    },
    dashboard: {
        title: 'Claws',
        description:
            'Sieh deine bereitgestellten OpenClaw-Instanzen ein und verwalte sie. Starte, stoppe, starte neu und überwache deine VPS-Server.',
        claw: 'Claw',
        clawsPlural: 'Claws',
        clawCountLabel: '{{count}} Claws',
        clawCountLabelSingular: '{{count}} Claw',
        newClaw: 'Neuer Claw',
        clawActions: 'Claw-Aktionen',
        noClawsYet: 'Keine Claws',
        noClawsDescription:
            'Kein bereitgestellter Claw gefunden. Aber du kannst jederzeit deinen ersten Claw ab 25 $/Monat bereitstellen. Einfach per KI.',
        deleteClaw: 'Claw löschen',
        deleteClawConfirmation: 'Bist du sicher, dass du löschen möchtest',
        deleteClawWarning:
            'Dein Abonnement wird gekündigt und der Server wird am Ende deines aktuellen Abrechnungszeitraums gelöscht. Du kannst ihn bis dahin weiter nutzen.',
        actionCannotBeUndone:
            'Diese Aktion kann nicht rückgängig gemacht werden.',
        start: 'Starten',
        stop: 'Stoppen',
        restart: 'Neustarten',
        stopClaw: 'Claw stoppen',
        stopClawConfirmation:
            'Bist du sicher, dass du den Server stoppen möchtest? Dies beendet alles, was läuft, einschließlich OpenClaw, aber du kannst jederzeit neu starten. Stoppen beendet nicht die Abrechnung – lösche den Server, um keine Kosten mehr zu haben.',
        restartClaw: 'Claw neustarten',
        restartClawConfirmation:
            'Bist du sicher, dass du den Server neustarten möchtest? Dies beendet alles, was läuft, einschließlich OpenClaw.',
        copyPassword: 'Passwort kopieren',
        copySshWithKey: 'SSH kopieren (mit Schlüssel)',
        copySshWithPassword: 'SSH kopieren (mit Passwort)',
        connect: 'SSH-Befehl kopieren',
        viewServerCredentials: 'Server-Zugangsdaten anzeigen',
        serverCredentials: 'Server-Zugangsdaten',
        serverCredentialsDescription:
            'Verwende diese Zugangsdaten, um dich per SSH mit deinem Server zu verbinden.',
        sshCommand: 'SSH-Befehl',
        rootPassword: 'Root-Passwort',
        sshCommandCopied: 'SSH-Befehl kopiert.',
        sshCommandWithPasswordCopied: 'SSH-Befehl mit Passwort kopiert.',
        passwordCopiedToClipboard: 'Passwort in die Zwischenablage kopiert.',
        plan: 'Server',
        location: 'Standort',
        ip: 'IP',
        domain: 'Domain',
        ipAddress: 'IP-Adresse',
        port: 'Port',
        planCost: 'Tarif',
        serverId: 'Server-ID',
        created: 'Erstellt',
        sshKey: 'SSH-Schlüssel',
        storage: 'Speicher',
        provider: 'Anbieter',
        nextBilling: 'Nächste Abrechnung',
        lastBilling: 'Letzte Abrechnung',
        version: 'Version',
        gatewayToken: 'Gateway-Token',
        gatewayTokenDescription:
            'Verwende dieses Token zur Authentifizierung mit deinem Gateway',
        scheduledForDeletion: 'Zur Löschung vorgemerkt',
        scheduledDeletionShort: 'Löschung am {{date}}',
        deletionDate: 'Dieser Claw wird am {{date}} gelöscht',
        deletionTooltip:
            'Zur Löschung am {{date}} vorgemerkt. Zum Abbrechen verwende das Menü.',
        cancelDeletion: 'Löschung abbrechen',
        deletionCancelled: 'Löschung abgebrochen.',
        scheduleDeletion: 'Löschung planen',
        resumeCheckout: 'Zahlung fortsetzen',
        cancelPurchase: 'Kauf abbrechen',
        hardDelete: 'Sofort löschen',
        hardDeleteClaw: 'Sofort löschen',
        hardDeleteConfirmation:
            'Bist du sicher, dass du diesen Claw sofort löschen möchtest? Du verlierst die verbleibende Zeit deines aktuellen Abrechnungszeitraums. Diese Aktion kann nicht rückgängig gemacht werden.',
        diagnostics: 'Diagnose',
        diagnosticsDescription:
            'Überprüfe den Zustand deiner OpenClaw-Instanz.',
        diagnosticsStatus: 'Status',
        diagnosticsLogs: 'Logs',
        diagnosticsRepair: 'Reparieren',
        diagnosticsRepairDescription:
            'Speicherlimits entfernen, neueste Dienstkonfiguration anwenden und das Gateway neu starten. Dies behebt die meisten häufigen Probleme.',
        diagnosticsRepairSuccess: 'Instanz erfolgreich repariert.',
        diagnosticsRepairFailed:
            'Reparatur durchgeführt, aber das Gateway antwortet noch nicht!',
        diagnosticsLoading: 'Verbindung zur Instanz wird hergestellt...',
        diagnosticsNoLogs:
            'Keine Logs verfügbar. Starte deine Instanz, um Logs zu generieren.',
        diagnosticsIssueDetected:
            'Ein Problem mit deiner Instanz wurde erkannt.',
        diagnosticsHealthy: 'Deine Instanz läuft normal.',
        diagnosticsPort: 'Port 18789',
        diagnosticsMemory: 'Arbeitsspeicher',
        logsDescription:
            'Die letzten 100 Zeilen deines Gateway-Logs, automatisch aktualisiert.',
        fileExplorer: 'Datei-Explorer',
        fileExplorerRoot: 'openclaw',
        fileExplorerDescription:
            'Durchsuche und bearbeite deine OpenClaw-Konfigurationsdateien. Falsche Änderungen können deine Instanz beschädigen.',
        fileExplorerSelectFile:
            'Wähle eine Datei aus, um ihren Inhalt anzuzeigen.',
        fileExplorerReadOnly: 'Nur lesen',
        fileExplorerSave: 'Speichern',
        fileExplorerSaved: 'Datei gespeichert.',
        fileExplorerInvalidJson:
            'Ungültiges JSON. Bitte behebe Syntaxfehler vor dem Speichern!',
        fileExplorerNoFiles: 'Keine Dateien gefunden',
        fileExplorerSearchFiles: 'Dateien suchen...',
        fileExplorerNoSearchResults: 'Keine passenden Dateien.',
        updateInstance: 'Instanz aktualisieren',
        updateInstanceSuccess: 'Instanz erfolgreich aktualisiert.',
        updateInstanceFailed: 'Instanz konnte nicht aktualisiert werden!',
        startFailed: 'Claw konnte nicht gestartet werden!',
        renameSuccess: 'Claw erfolgreich umbenannt.',
        renameFailed: 'Claw konnte nicht umbenannt werden!',
        renameInvalidChars:
            'Nur Buchstaben, Zahlen und Bindestriche sind erlaubt!',
        reinstallInstance: 'Instanz neu installieren',
        reinstallClaw: 'Instanz neu installieren',
        reinstallClawConfirmation:
            'Dies wird OpenClaw auf dieser Instanz vollständig neu installieren. Alle Konfigurationen, Agenten und Daten werden zurückgesetzt. Diese Aktion kann nicht rückgängig gemacht werden. Fortfahren?',
        reinstallInstanceSuccess: 'Instanz erfolgreich neu installiert.',
        reinstallInstanceFailed: 'Instanz konnte nicht neu installiert werden!',
        openControlPanel: 'Systemsteuerung öffnen',
        exportData: 'Claw exportieren (.zip)',
        exportStarted:
            'Export wird vorbereitet, das kann einen Moment dauern...',
        exportSuccess: 'Claw erfolgreich exportiert.',
        exportFailed: 'Claw-Daten konnten nicht exportiert werden!',
        exportRateLimited:
            'Du kannst in {{minutes}} Minuten erneut exportieren!',
        exportRateLimitedSeconds:
            'Du kannst in {{seconds}} Sekunden erneut exportieren!',
        configuringTooltip:
            'Dies kann einige Zeit dauern. Es hängt von OpenClaw, dem Serverstandort und Cloudflare DNS ab.',
        paymentSuccess: 'Dein Claw wird erstellt und konfiguriert.',
        dnsSetupBanner:
            'Richte lokales DNS ein, um auf deine Claws über subdomain.clawhost zuzugreifen.',
        dnsSetupButton: 'DNS einrichten',
        dnsSetupSuccess: 'DNS-Resolver erfolgreich konfiguriert.',
        dnsSetupError: 'DNS-Resolver konnte nicht konfiguriert werden!',
        chatTab: 'Chat',
        playgroundTab: 'Playground',
        userTab: 'Benutzer',
        adminTab: 'Admin',
        adminTitle: 'Admin',
        adminDescription: 'Verwalte alle Claws auf der Plattform.',
        adminNoClaws: 'Noch keine Claws auf der Plattform.',
        adminAccessDenied:
            'Du hast keine Berechtigung, auf diese Seite zuzugreifen!',
        owner: 'Besitzer',
        status: {
            running: 'Läuft',
            stopped: 'Gestoppt',
            starting: 'Wird gestartet',
            stopping: 'Wird gestoppt',
            creating: 'Wird erstellt',
            configuring: 'Wird konfiguriert',
            initializing: 'Wird eingerichtet',
            migrating: 'Wird migriert',
            rebuilding: 'Wird neu aufgebaut',
            restarting: 'Wird neu gestartet',
            unreachable: 'Nicht erreichbar',
            deleting: 'Wird gelöscht',
            scheduledDeletion: 'Löschung geplant',
            awaitingPayment: 'Wartet auf Zahlung',
            unknown: 'Unbekannt',
            checking: 'Wird überprüft'
        }
    },
    chat: {
        explorer: 'Explorer',
        selectAgent: 'Keine Auswahl',
        selectAgentDescription:
            'Wähle ein Claw oder einen Agenten aus der Seitenleiste.',
        noAgents: 'Keine Agenten verfügbar',
        noAgentsDescription:
            'Stelle einen Claw bereit, um mit Agenten zu chatten',
        openSidebar: 'Seitenleiste öffnen',
        clawNotReady: 'Claw ist noch nicht bereit',
        notConfigured: 'Nicht konfiguriert',
        addAgent: 'Agent hinzufügen',
        viewTree: 'Baumansicht',
        viewList: 'Listenansicht',
        clawSettings: 'Claw-Einstellungen'
    },
    createClaw: {
        title: 'OpenClaw bereitstellen',
        description:
            'Konfiguriere deinen Server und beginne mit KI zu arbeiten.',
        clawName: 'Name',
        clawNamePlaceholder: 'z. B. cozy-panda',
        clawNameInvalidChars:
            'Nur Buchstaben, Zahlen und Bindestriche sind erlaubt!',
        autoGenerateNameHint:
            'Leer lassen, um automatisch einen Namen zu generieren.',
        provider: 'Anbieter',
        providerHetzner: 'Hetzner',
        providerLocal: 'Lokal',
        providerAws: 'AWS',
        comingSoon: 'Bald',
        location: 'Standort',
        locationUnavailable: 'Nicht verfügbar',
        locationUnavailableForPlan: 'Nicht verfügbar',
        plan: 'Server',
        planUnavailable: 'Nicht verfügbar',
        planUnavailableForLocation: 'An diesem Standort nicht verfügbar',
        providerUnavailable: 'Dieser Anbieter ist derzeit nicht verfügbar.',
        providerDisabledHetznerRecommended: 'Nicht verfügbar',
        providerAtCapacity:
            'Aufgrund hoher Nachfrage sind die Server dieses Anbieters vorübergehend ausgeschöpft. Wir arbeiten aktiv an einer Lösung.',
        advancedOptions: 'Erweiterte optionale Optionen',
        rootPassword: 'Root-Passwort',
        rootPasswordPlaceholder: 'Passwort eingeben oder generieren',
        gatewayTokenPlaceholder: 'z.B. a1b2c3d4e5f6...',
        autoGenerateGatewayTokenHint:
            'Optional. Kein Token, wenn leer gelassen.',
        autoGeneratePasswordHint:
            'Optional. Kein Passwort, wenn leer gelassen.',
        regeneratePassword: 'Passwort neu generieren',
        sshKeyOptional: 'SSH-Schlüssel',
        noSshKeyPasswordOnly: 'Kein SSH-Schlüssel (nur Passwort)',
        noSshKeysConfigured: 'Keine SSH-Schlüssel konfiguriert',
        addSshKeyForPasswordlessLogin:
            'Füge einen SSH-Schlüssel für passwortlose Anmeldung hinzu',
        additionalStorageOptional: 'Zusätzlicher Speicher',
        volumeStorage: 'Volumenspeicher',
        vpsServer: 'VPS-Server',
        openClawPreinstalled: 'OpenClaw vorinstalliert',
        storageWithSize: 'Speicher',
        billingInterval: 'Abrechnung',
        monthly: 'Monatlich',
        yearly: 'Jährlich',
        yearlySaveBadge: '2 Monate gratis',
        yearlySavings: 'Sie sparen',
        totalMonthly: 'Monatlich gesamt',
        totalYearly: 'Jährlich gesamt',
        creating: 'Wird erstellt...',
        proceedToPayment: '{{amount}} $ zahlen zum Bereitstellen',
        agreementNotice: 'Mit der Bereitstellung stimmst du unseren',
        selectServerToContinue: 'Wähle einen Server, um fortzufahren',
        selectLocationToContinue: 'Wähle einen Standort, um fortzufahren',
        clawCreated: 'Claw erstellt.',
        assigning: 'Wird zugewiesen...',
        rootPasswordSaveThis: 'Root-Passwort (bitte speichern!)',
        sshCommandUsingKey: 'SSH-Befehl (mit deinem Schlüssel)',
        sshCommandWithPassword: 'SSH-Befehl (mit Passwort)',
        passwordCopied: 'Passwort kopiert.',
        planSpec: '{{cpu}} vCPU / {{memory}} GB RAM / {{disk}} GB SSD',
        volumeUnit: 'GB',
        volumeMin: '0 GB',
        volumeMax: '500 GB'
    },
    sshKeys: {
        title: 'SSH-Schlüssel',
        description:
            'Verwalte deine SSH-Schlüssel für sicheren, passwortlosen Zugriff auf deine OpenClaw-Instanzen.',
        key: 'SSH-Schlüssel',
        keys: 'SSH-Schlüssel',
        addSshKey: 'SSH-Schlüssel hinzufügen',
        howSshKeysWork: 'Wie verbinde ich einen SSH-Schlüssel?',
        step1: 'Generiere ein SSH-Schlüsselpaar auf deinem Computer (oder verwende ein vorhandenes).',
        step2: 'Füge den öffentlichen Schlüssel hier hinzu.',
        step3: 'Wähle den Schlüssel beim Erstellen einer neuen Instanz aus.',
        step4: 'Verbinde dich mit',
        step4Command: 'ssh root@deine-server-ip',
        step4Suffix: '– kein Passwort nötig.',
        noSshKeysYet: 'Keine SSH-Schlüssel',
        noSshKeysDescription:
            'Keine SSH-Schlüssel in deinem Konto vorhanden. Du kannst sie jederzeit hinzufügen und dich mit deinen bereitgestellten Claws verbinden.',
        deleteConfirmation:
            'Bist du sicher, dass du diesen SSH-Schlüssel löschen möchtest?',
        deleteKey: 'SSH-Schlüssel löschen',
        deleteKeyConfirmation: 'Bist du sicher, dass du löschen möchtest',
        sshKeyAddedSuccessfully: 'SSH-Schlüssel erfolgreich hinzugefügt.',
        addSshKeyModalTitle: 'SSH-Schlüssel hinzufügen',
        addSshKeyModalDescription:
            'Füge einen SSH-Schlüssel für passwortlose Authentifizierung hinzu',
        iHaveAnSshKey: 'Vorhandener Schlüssel',
        generateNewKey: 'Neuen erstellen',
        name: 'Name',
        namePlaceholder: 'z. B.: mein-macbook',
        publicKey: 'Öffentlicher Schlüssel',
        publicKeyPlaceholder: 'ssh-rsa AAAA... oder ssh-ed25519 AAAA...',
        publicKeyHint: 'Deinen öffentlichen Schlüssel findest du unter',
        publicKeyPath1: '~/.ssh/id_ed25519.pub',
        publicKeyPathOr: 'oder',
        publicKeyPath2: '~/.ssh/id_rsa.pub',
        important: 'Wichtig:',
        dontHaveSshKey: 'Keinen SSH-Schlüssel? Generiere einen:',
        sshKeygenCommand: 'ssh-keygen -t ed25519 -C "deine-email@example.com"',
        keyName: 'Schlüsselname',
        keyNamePlaceholder: 'Mein generierter Schlüssel',
        importantAfterGenerating:
            'Nach der Generierung musst du deinen privaten Schlüssel herunterladen und speichern. Wir können ihn nicht wiederherstellen, wenn du ihn verlierst!',
        generateKeyPair: 'Schlüsselpaar generieren',
        orGenerateLocallyRecommended: 'Oder lokal generieren (empfohlen)',
        runThisInYourTerminal: 'Führe dies in deinem Terminal aus:',
        thenSwitchToIHave:
            'Wechsle dann zu „Vorhandener Schlüssel" und füge den öffentlichen Schlüssel ein.',
        savePrivateKeyNow:
            'Speichere deinen privaten Schlüssel JETZT! Lade ihn herunter, bevor du diesen Dialog schließt. Du wirst ihn nicht erneut sehen können.',
        privateKeyKeepSecret: 'Privater Schlüssel (geheim halten!)',
        downloadPrivateKey: 'Privaten Schlüssel herunterladen',
        publicKeyWillBeSaved: 'Öffentlicher Schlüssel (wird gespeichert)',
        savePublicKey: 'Öffentlichen Schlüssel speichern'
    },
    landing: {
        title: 'OpenClaw bereitstellen. Ein Klick. Fertig.',
        description:
            'Stelle OpenClaw mit einem Klick auf deinem eigenen VPS bereit. Selbst-hostbares Cloud-Hosting mit vollem Root-Zugriff, globalen Standorten und transparenten Preisen.',
        badge: 'OpenClaw vereinfacht',
        tutorialBadge: 'Anschauen. Deployen.',
        tutorialVideoThumbnail: 'ClawHost Tutorial-Video Vorschaubild',
        heroTitle1: 'OpenClaw bereitstellen.',
        heroTitle2: 'Ein Klick. Fertig.',
        heroDescription:
            'OpenClaw-Agenten in der Cloud oder lokal mit einem Klick bereitstellen – erstelle, verbinde und skaliere deine KI-Agenten schneller mit ClawHost.',
        goToClaws: 'Zu Claws',
        selfHost: 'Open Source',
        startingPrice: 'Ab',
        locations: 'Standorte',
        servers: 'Server',
        zeroCount: 'Null',
        zeroConfig: 'Keine Konfiguration',
        dashboardPreviewTitle: 'Claws',
        dashboardPreviewSubtitle: '5 hinzugefügte Claws',
        deployNew: 'Neuen bereitstellen',
        running: 'Läuft',
        latency: 'Latenz',
        howItWorks: 'Ablauf',
        threeStepsToPrivacy: 'Drei Schritte zu OpenClaw',
        howItWorksDescription:
            'Von null zu einem vollständig bereitgestellten OpenClaw für den 24/7-Einsatz mit vollem Zugriff.',
        step1Title: 'Server auswählen',
        step1Description:
            'Wähle aus über 30 globalen Standorten bei drei Anbietern. Wir starten einen dedizierten VPS nur für dich in Sekunden.',
        step2Title: 'Auto-Installation',
        step2Description:
            'OpenClaw ist vorinstalliert mit einem direkten Link und VPS-Details. Keine Einrichtung nötig.',
        step3Title: 'Er gehört dir',
        step3Description:
            'Voller Zugriff auf OpenClaw und den VPS, ohne Einschränkungen bei dem, was du erreichen kannst.',
        features: 'Funktionen',
        whyClawHost: 'Alles-in-einem-Funktionen',
        featuresDescription:
            'Warum es sich lohnt – Funktionen sprechen für sich.',
        zeroConfigDescription:
            'Überspringe stundenlange Server- und OpenClaw-Einrichtung. Es ist vorinstalliert und innerhalb von Minuten bereit.',
        ownedData: '100 % deine Daten',
        ownedDataDescription:
            'Dein eigener Server, deine Daten. Keine geteilte Infrastruktur, keine Logs, keine Drittanbieter. 24/7 online.',
        fullSpeed: 'Volle Geschwindigkeit',
        fullSpeedDescription:
            'Dedizierte VPS-Ressourcen bedeuten kein Drosseln, volle Bandbreite und blitzschnelles Internet.',
        globalLocations: 'Globale Standorte',
        globalLocationsDescription:
            'Deploye OpenClaw in mehreren globalen Regionen auf Hetzner Cloud und wähle den nächstgelegenen Standort.',
        fullSshAccess: 'Direkter SSH-Zugriff',
        fullSshAccessDescription:
            'Greife direkt von der Plattform auf das Terminal deines Servers zu. Keine externen SSH-Clients nötig.',
        secure: 'Sicher',
        secureDescription:
            'Standardmäßig geschützt vor SSL-Schwachstellen, Malware und gängigen Sicherheitsbedrohungen.',
        payAsYouGo: 'Einfache Preise',
        payAsYouGoDescription:
            'Preise basierend auf deinem Bedarf. Keine erzwungenen hohen Rechnungen für Server niedriger Qualität. Jederzeit kündbar.',
        customSubdomains: 'Online-Zugang',
        customSubdomainsDescription:
            'Vergiss lokale Netzwerke. Greife von überall sicher auf dein OpenClaw über eine Subdomain zu.',
        autoUpdates: 'Versionskontrolle',
        autoUpdatesDescription:
            'Wechsle mit einem Klick zu jeder OpenClaw-Version. Bleib immer aktuell oder geh bei Bedarf zurück.',
        openclawControl: 'OpenClaw-Steuerung',
        openclawControlDescription:
            'Greife direkt von ClawHost auf das native OpenClaw-Panel zu. Voller Bearbeitungszugriff auf alles, was OpenClaw bietet.',
        clawHostControl: 'ClawHost-Steuerung',
        clawHostControlDescription:
            'Verwalte Dateien, Updates, Kanäle, Variablen, Skills und weitere Konfigurationsoptionen direkt von der Plattform aus.',
        skillsMarketplace: '5.000+ Skills',
        skillsMarketplaceDescription:
            'Durchsuche und installiere über 5.000 fertige Skills mit einem einzigen Klick. Erweitere dein OpenClaw sofort.',
        directChat: 'Direkter Chat',
        directChatDescription:
            'Chatte direkt von der Plattform mit deinen KI-Agenten. Keine externen Tools oder Oberflächen nötig.',
        multipleAgents: 'Mehrere Agenten',
        multipleAgentsDescription:
            'Führe mehrere KI-Agenten auf einer einzigen Instanz aus und verwalte sie. Jeder mit eigener Konfiguration und Zweck.',
        multipleClaws: 'Mehrere Claws',
        multipleClawsDescription:
            'Stelle mehrere OpenClaw-Instanzen über ein einziges Dashboard bereit und verwalte sie. Skaliere nach Bedarf.',
        testimonials: 'Stimmen',
        whatPeopleSay: 'Was andere sagen',
        testimonialsDescription:
            'Nimm nicht nur unser Wort dafür. Sieh, wie andere OpenClaw bereitstellen.',
        testimonial1Quote:
            'Endlich mein eigener KI-Server. Die Einrichtung dauerte 30 Sekunden und ich betreibe ihn seit Monaten ohne Probleme.',
        testimonial1Author: 'Alex Chen',
        testimonial1Role: 'Softwareentwickler',
        testimonial2Quote:
            'Keine geteilten Ressourcen mehr mit anderen. Meine OpenClaw-Instanz bewältigt alles, was ich ihr gebe.',
        testimonial2Author: 'Maria Santos',
        testimonial2Role: 'Digitale Nomadin',
        testimonial3Quote:
            'Die Ein-Klick-Bereitstellung funktioniert wirklich. Ich bin überhaupt nicht technisch, hatte aber mein OpenClaw in unter einer Minute am Laufen.',
        testimonial3Author: 'James Wilson',
        testimonial3Role: 'Freelancer',
        testimonial4Quote:
            'Ich liebe es, dass ich genau sehen kann, was auf meinem Server läuft. Volle Kontrolle über mein KI-Setup.',
        testimonial4Author: 'Sophie Kim',
        testimonial4Role: 'KI-Enthusiastin',
        pricing: 'Preise',
        simpleTransparentPricing: 'Einfache, transparente Preise',
        pricingDescription:
            'Wähle aus unseren Hetzner Cloud Servern basierend auf deinen Anforderungen.',
        planColumn: 'Server',
        vCpuColumn: 'vCPU',
        ramColumn: 'RAM',
        storageColumn: 'Speicher',
        monthlyColumn: 'Preis',
        tierShared: 'Geteilte vCPU',
        tierDedicated: 'Dedizierte vCPU',
        tierArm: 'Ampere (ARM)',
        tierRegular: 'Reguläre Leistung',
        tierHighPerformance: 'Hohe Leistung',
        tierHighFrequency: 'Hohe Frequenz',
        recommended: 'Empfohlen',
        perMonth: '/Mo.',
        perYear: '/Jahr',
        yearlyDiscount: '— 2 Monate gratis',
        billedYearly: 'jährlich abgerechnet',
        deploy: 'Bereitstellen',
        select: 'Auswählen',
        selectPlanLabel: '{{plan}}-Plan auswählen',
        deployPlanLabel: '{{plan}}-Plan bereitstellen',
        openClawPreinstalled: 'OpenClaw vorinstalliert',
        unlimitedBandwidth: 'Unbegrenzte Bandbreite',
        rootSshAccess: 'Voller Root-SSH-Zugriff',
        onlineAllDay: '24/7 online',
        highQualityInternet: 'Hochqualitatives Internet',
        faqTitle: 'Fragen',
        frequentlyAskedQuestions: 'Häufige Fragen',
        faqDescription: 'Jede häufig gestellte Frage, beantwortet.',
        faq1Question: 'Was ist ClawHost?',
        faq1Answer:
            'ClawHost ist eine Plattform, die OpenClaw für jeden zugänglich macht. Sie ermöglicht es sowohl nicht-technischen Benutzern als auch Entwicklern, OpenClaw ohne Infrastrukturverwaltung zu betreiben. Wir kümmern uns um Server, Verfügbarkeit, Sicherheit und Wartung – du nutzt einfach OpenClaw.',
        faq2Question: 'Was ist OpenClaw?',
        faq2Answer:
            'OpenClaw ist eine selbst-gehostete sichere Zugriffsschicht für deine KI-Werkzeuge und -Dienste. Es ist vorkonfiguriert für Sicherheit und Leistung, sodass du es bereitstellen und sofort verbinden kannst.',
        faq3Question:
            'Wie unterscheidet sich das von anderen KI-Werkzeugen oder gehosteten Plattformen?',
        faq3Answer:
            'Anders als gehostete KI-Werkzeuge gibt dir ClawHost einen echten Server mit installiertem OpenClaw. Du besitzt die Infrastruktur, kontrollierst alles und bist nicht durch eine geteilte Plattform oder ein Modell eingeschränkt.',
        faq4Question: 'Brauche ich technisches Wissen?',
        faq4Answer:
            'Nein. Wir kümmern uns um die gesamte Infrastruktur, Einrichtung und Wartung. Du kannst OpenClaw über die Benutzeroberfläche konfigurieren und verwalten, Kanäle verbinden und die Nutzung anpassen – ohne Server oder Infrastruktur anfassen zu müssen.',
        faq5Question: 'Welche Standorte sind verfügbar?',
        faq5Answer:
            'Wir bieten mehrere Serverstandorte weltweit über Hetzner Cloud an, darunter die USA, Europa und mehr. Du kannst OpenClaw bei Bedarf auf mehreren Servern in verschiedenen Regionen deployen.',
        faq6Question: 'Wie viel kostet es?',
        faq6Answer:
            'Die Preise hängen vom gewählten Server ab. Mit mehreren Serveroptionen von Einsteiger bis Hochleistung wählst du das, was zu deinen Anforderungen und deinem Budget passt.',
        faq7Question: 'Kann ich direkt auf meinen Server zugreifen?',
        faq7Answer:
            'Ja. Neben dem OpenClaw-Zugriff über eine Subdomain-URL hast du vollen Zugriff auf den Server und seine zugrunde liegende Infrastruktur, was dir vollständige Freiheit gibt, alles anzupassen und alles auszuführen, was du brauchst.',
        faq8Question: 'Wo werden die Server gehostet?',
        faq8Answer:
            'Alle Server werden auf Hetzner Cloud gehostet, einem vertrauenswürdigen Cloud-Anbieter, bekannt für leistungsstarke Hardware und hervorragende Verfügbarkeit, genutzt von großen Infrastrukturen.',
        comparison: 'Vergleich',
        comparisonTitle: 'Wie wir uns unterscheiden',
        comparisonDescription:
            'Es gibt nur eine vergleichbare Plattform, und unser Ansatz setzt auf echte Server und volles Eigentum statt Einschränkungen.',
        others: 'Andere',
        comparisonOpenClawUs: 'Voller Zugriff auf OpenClaw',
        comparisonOpenClawOthers: 'Nur Chat, keine Verwaltung',
        comparisonPricingUs: 'Transparente Preise, klare Spezifikationen',
        comparisonPricingOthers: 'Versteckte Spezifikationen, unklare Preise',
        comparisonOwnershipUs: 'Du besitzt deinen Server vollständig',
        comparisonOwnershipOthers: 'Du besitzt nichts',
        comparisonSubdomainUs: 'Zugriff über Subdomain',
        comparisonSubdomainOthers: 'Zugriff nur über soziale Kanäle',
        comparisonInfraUs: 'On-Demand-Infrastruktur',
        comparisonInfraOthers: 'Begrenzte Server',
        comparisonDataUs: 'Deine Daten gehören dir',
        comparisonDataOthers: 'Deine Daten gehören dir nicht',
        comparisonMultipleUs: 'Mehrere OpenClaw, ein Claw',
        comparisonMultipleOthers: 'Nur ein OpenClaw',
        comparisonAgentsUs: 'Mehrere Agenten pro Claw',
        comparisonAgentsOthers: 'Nur ein Agent',
        comparisonOpenSourceUs: 'Vollständig Open Source',
        comparisonOpenSourceOthers: 'Closed Source',
        comparisonExportUs: 'Exportiere dein OpenClaw überallhin',
        comparisonExportOthers: 'Anbieterabhängigkeit',
        comparisonProvidersUs: 'Mehrere Serveranbieter',
        comparisonProvidersOthers: 'Nur ein einzelner Anbieter',
        comparisonSocialsUs: 'Präsenz in sozialen Medien',
        comparisonSocialsOthers: 'Keine sozialen Medien',
        comparisonChatUs: 'Direkt mit deinem Claw chatten',
        comparisonChatOthers: 'Chat nur über Kanäle',
        comparisonVersionUs: 'Versionswechsel mit einem Klick',
        comparisonVersionOthers: 'Nur manuelle Updates',
        comparisonTerminalUs: 'Integriertes Web-Terminal',
        comparisonTerminalOthers: 'SSH-Client erforderlich',
        seeFullComparison: 'Vollständigen Vergleich anzeigen',
        comparisonCtaText:
            'Wir vergleichen mit SimpleClaw, MyClaw.ai und mehr — Funktion für Funktion.',
        readyToOwnYourPrivacy: 'Bereit, OpenClaw bereitzustellen?',
        ctaDescription:
            'Erhalte einen dedizierten Server mit vorinstalliertem OpenClaw. Voller Root-Zugriff, globale Standorte und in Minuten bereit. Er gehört dir jederzeit. Ab 25 $.',
        deployOpenClawNow: 'OpenClaw bereitstellen',
        selfHostInstead: 'Stattdessen selbst hosten',
        noCreditCardRequired: 'Sofortige Einrichtung',
        deployIn60Seconds: 'Sicher',
        demoClawStarted: 'Claw gestartet.',
        demoClawStopped: 'Claw gestoppt.',
        demoClawRestarting: 'Claw wird neu gestartet...',
        demoClawRestarted: 'Claw neu gestartet.',
        demoClawDeleted: 'Claw gelöscht.',
        demoStatus: '{{running}} aktiv, {{total}} gesamt'
    },
    blog: {
        title: 'Blog',
        description:
            'Anleitungen, Tutorials und Neuigkeiten über OpenClaw und selbst-gehostete Infrastruktur.',
        readingTime: '{{minutes}} Min. Lesezeit',
        publishedOn: 'Veröffentlicht am {{date}}',
        writtenBy: 'Von {{author}}',
        backToBlog: 'Zurück zum Blog',
        noPosts: 'Noch keine Beiträge',
        noPostsDescription:
            'Blogbeiträge kommen bald. Schau später noch einmal vorbei.',
        ctaTitle: 'Deploye OpenClaw mit einem Klick',
        ctaDescription:
            'Erhalte einen dedizierten Server mit vorinstalliertem OpenClaw. Voller Root-Zugriff, globale Standorte und in Minuten bereit. Er gehört dir jederzeit. Ab 25 $.',
        ctaDeploy: 'OpenClaw deployen',
        ctaGitHub: 'Auf GitHub ansehen'
    },
    changelog: {
        title: 'Änderungsprotokoll',
        description:
            'Verfolge Updates, neue Funktionen und Verbesserungen an ClawHost.',
        subtitle:
            'Alle Updates, neue Funktionen und Verbesserungen an ClawHost.',
        upcomingRelease: 'In Bearbeitung',
        upcomingReleaseTitle: 'Mobile App & Mehr',
        upcomingReleaseDescription:
            'Verwalte deine OpenClaw-Instanzen von überall. Eine native mobile App sowie fortlaufende Plattformverbesserungen.',
        upcomingReleaseFeature1:
            'Native mobile App zur Überwachung und Verwaltung deiner OpenClaw-Instanzen unterwegs',
        upcomingReleaseFeature3: 'Unterstützung für dunkles und helles Design',
        upcomingReleaseFeature4:
            'Verbesserungen bei Leistung, Stabilität und Reaktionsfähigkeit',
        upcomingReleaseFeature5:
            'Mehrsprachige Unterstützung mit Englisch, Französisch, Spanisch und Deutsch',
        upcomingReleaseFeature6:
            'Vergleichsseiten mit vollständigen Analysen gegenüber Wettbewerbern',
        upcomingReleaseFeature7:
            'Refactoring der Playground-Funktionsstruktur und Vereinfachungen',
        upcomingReleaseFeature8:
            'Feature-Anfragen automatisch verwaltet und veröffentlicht durch OpenClaw-Agenten',
        upcomingReleaseFeature9:
            'Sprachmodus zur Interaktion mit den auf ClawHost gehosteten OpenClaw-Agenten (Beta)',
        upcomingReleaseFeature10:
            'OpenClaw auf Ihrer Instanz neu installieren, um von vorne zu beginnen, einmal pro Tag verfügbar',
        upcomingReleaseFeature11:
            'Landingpage für ClawHost Go, lokales Hosting mit ClawHost',
        upcomingReleaseFeature12:
            'Desktop-App für macOS und Windows, um OpenClaw lokal mit einem Klick bereitzustellen',
        release13Date: '19. März 2026',
        release13Title: 'Neue Sprachen & ClawHost Go Beta',
        release13Description:
            '10 neue Sprachen und ClawHost Go Beta für lokales OpenClaw-Deployment auf macOS und Windows mit einem Klick.',
        release13Feature1:
            '10 neue Sprachen hinzugefügt: Chinesisch, Hindi, Arabisch, Russisch, Japanisch, Türkisch, Italienisch, Polnisch, Niederländisch und Portugiesisch',
        release13Feature2:
            'Beta-Version von ClawHost Go für macOS und Windows, OpenClaw lokal mit einem Klick deployen',
        release12Date: '14. März 2026',
        release12Title: 'Jahresabonnements, Sprachmodus & mehr',
        release12Description:
            'Jahresabonnements mit 2 Monaten gratis, Sprachmodus, Instanz-Neuinstallation und eine erste Landingpage für ClawHost Go.',
        release12Feature1:
            'Landingpage für ClawHost Go, lokales Hosting mit ClawHost',
        release12Feature2:
            'Jahresabonnement-Support mit 2 Monaten gratis bei jährlicher Buchung',
        release12Feature3:
            'Sprachmodus zur Interaktion mit den auf ClawHost gehosteten OpenClaw-Agenten',
        release12Feature4:
            'OpenClaw auf Ihrer Instanz neu installieren, um von vorne zu beginnen, einmal pro Tag verfügbar',
        release11Date: '28. Februar 2026',
        release11Title: 'Text-zu-Sprache, Terminal, Chat-Tabs & Datei-Explorer',
        release11Description:
            'Hören Sie sich Agentenantworten mit Text-zu-Sprache an, interagieren Sie direkt über das Terminal mit Ihrem VPS, navigieren Sie schneller in Chats mit Seitenleisten-Tabs und durchsuchen Sie Dateien mit dem verbesserten Datei-Explorer.',
        release11Feature1:
            'Text-zu-Sprache für Agentennachrichten im Playground',
        release11Feature2:
            'Terminal zur direkten Interaktion mit Ihren VPS-Instanzen vom Dashboard aus',
        release11Feature3:
            'Chat-Seitenleisten-Tabs für einfachen Zugriff und Navigation',
        release11Feature4:
            'Verbesserungen am Datei-Explorer mit Suchleiste zum Durchsuchen von Dateien',
        release11Feature5:
            'Behebung von Nachrichtenzeitstempeln, die nicht in Echtzeit angezeigt wurden',
        release11Dropped1: 'Feature-Anfragen zur Vereinfachung entfernt',
        release10Date: '22. Februar 2026',
        release10Title: 'Feature-Anfragen, Datei-Explorer & Fehlerbehebungen',
        release10Description:
            'Community-getriebene Feature-Anfragen, erweiterte Dateibearbeitungsunterstützung und verschiedene Fehlerbehebungen.',
        release10Feature1:
            'Feature-Anfragen automatisch verwaltet und veröffentlicht durch OpenClaw-Agenten',
        release10Feature2:
            'Behebung von Skills, die manchmal nicht vom ClawHub-Marktplatz installiert werden konnten',
        release10Feature3:
            'Behebung des Modellanbieterwechsels, der sich nicht auswirkte und weiterhin das ursprüngliche Modell verwendete',
        release10Feature4:
            'Mehrere Verbesserungen und Fehlerbehebungen auf der Plattform',
        release10Feature5:
            'TypeScript-, Markdown- und Textdateien sind jetzt im Datei-Explorer bearbeitbar',
        release9Date: '21. Februar 2026',
        release9Title: 'Vergleiche, Playground-Refactoring & Mehr',
        release9Description:
            'Vergleichsseiten mit Wettbewerbern, Umstrukturierung der Playground-Funktionen, mehrsprachige Unterstützung und allgemeine Leistungsverbesserungen.',
        release9Feature1: 'Unterstützung für dunkles und helles Design',
        release9Feature2:
            'Mehrsprachige Unterstützung mit Englisch, Französisch, Spanisch und Deutsch',
        release9Feature3:
            'Vergleichsseiten mit vollständigen Analysen gegenüber Wettbewerbern',
        release9Feature4:
            'OpenClaw-Versionen, mit einem Klick aktualisieren oder jede Version sofort installieren',
        release9Feature5:
            'Refactoring der Playground-Funktionsstruktur und Vereinfachungen',
        release9Feature6:
            'Verbesserungen bei Leistung, Stabilität und Reaktionsfähigkeit',
        release8Date: '18. Februar 2026',
        release8Title: 'Helles Design, Leistung & Stabilität',
        release8Description:
            'Helles Design, Leistungs- und Erfahrungsverbesserungen sowie Stabilitäts- und Reaktionsfähigkeitsverbesserungen.',
        release8Feature1: 'Helles, dunkles und systembasiertes Design',
        release8Feature2: 'Leistungs- und Erfahrungsverbesserungen',
        release8Feature3: 'Stabilitäts- und Reaktionsfähigkeitsverbesserungen',
        release7Date: '16. Februar 2026',
        release7Title: 'Chat-Refactoring & Spracheingabe',
        release7Description:
            'Große Chat- und Playground-Verbesserungen mit Sprachinteraktion, ClawHub-Skills-Marktplatz und Dateianhängen für Agenten.',
        release7Feature1:
            'Chat- und Playground-Refactoring für ein flüssigeres, reaktionsschnelleres Erlebnis',
        release7Feature2:
            'Sprachinteraktion mit Chats, Sprache direkt im Browser aufnehmen und transkribieren',
        release7Feature3:
            'ClawHub-Skills-Integration mit über 5.000 verfügbaren Skills zum Installieren und Verwalten',
        release7Feature4:
            'Anhänge-Ansicht und -Nutzung für Agenten, Bilder und Dokumente im Chat senden',
        release6Date: '16. Februar 2026',
        release6Title: 'Kanäle, Skills & Agenten-Chat',
        release6Description:
            'Volle Kontrolle über deine OpenClaw-Kanäle, -Skills und -Agenten. Verwalte und chatte mit allem direkt vom Dashboard aus.',
        release6Feature1:
            'Kanäle direkt verwalten, hinzufügen, entfernen und konfigurieren, ohne den Server anzufassen',
        release6Feature2:
            'Skills direkt verwalten, installieren, aktualisieren und Agenten-Skills vom Dashboard aus organisieren',
        release6Feature3:
            'Chatte mit deinen Agenten im Playground, interagiere mit jedem Agenten in Echtzeit',
        release6Feature4:
            'Anmeldung mit Google oder GitHub, schnelle, sichere Authentifizierung ohne E-Mail-Codes',
        release1Date: '8. Februar 2026',
        release1Title: 'Erstveröffentlichung',
        release1Description:
            'Die erste offizielle Veröffentlichung von ClawHost. Stelle OpenClaw mit einem Klick auf deinem eigenen VPS bereit.',
        release1Feature1: 'Ein-Klick-OpenClaw-Bereitstellung auf Hetzner Cloud',
        release1Feature2:
            'Dashboard zur Verwaltung von Claws – Instanzen starten, stoppen, neustarten und löschen',
        release1Feature3:
            '18 Hetzner-Serverpläne mit dedizierter vCPU, RAM und Speicheroptionen',
        release1Feature4:
            '6 Hetzner-Serverstandorte in den USA, Europa und Asien',
        release1Feature5:
            'SSH-Schlüsselverwaltung für passwortlosen Serverzugriff',
        release1Feature6: 'Zusätzlicher Volumenspeicher bis zu 10 TB',
        release1Feature7:
            'Magic-Link-Authentifizierung, keine Passwörter nötig',
        release1Feature8: 'Online-Zugriff auf OpenClaw über sichere Subdomains',
        release1Feature9:
            'Zahlungsintegration mit transparenter Preisgestaltung pro Server',
        release1Feature10: 'Abrechnungsverlauf und Rechnungsverwaltung',
        release1Feature11:
            'Automatische Bereitstellung mit vorinstalliertem und konfiguriertem OpenClaw',
        release2Date: '8. Februar 2026',
        release2Title: 'Changelog & mehr',
        release2Description:
            'Eine neue Möglichkeit, über alles rund um ClawHost informiert zu bleiben.',
        release2Feature1:
            'Änderungsprotokoll-Seite zur Verfolgung aller Plattform-Updates und -Veröffentlichungen',
        release3Date: '10. Februar 2026',
        release3Title: 'Server-Einblicke',
        release3Description:
            'Tiefere Einblicke und Kontrolle über deine Server, direkt vom Dashboard aus.',
        release3Feature1: 'Echtzeit-Server-Logs direkt im Dashboard gestreamt',
        release3Feature2:
            'Serverdiagnose mit automatischer Ein-Klick-Reparatur bei Dienstproblemen',
        release3Feature3:
            'Integrierter Datei-Explorer und JSON-Editor für Serverkonfigurationsdateien',
        release4Date: '14. Februar 2026',
        release4Title: 'Agenten & Datenexport',
        release4Description:
            'Agenten-Playground, Multi-Agenten-Verwaltung und portabler Datenexport für deine OpenClaw-Instanzen.',
        release4Feature1:
            'Ein-Klick-Agenten-Playground und -Übersicht, mehrere Agenten hinzufügen und verwalten',
        release4Feature2: 'Exportiere dein OpenClaw als portables ZIP-Archiv',
        release4Feature3:
            'Interaktiver Playground mit graphbasierter Visualisierung von Claws und Agenten',
        release4Feature4:
            'Raster- und Listenansicht-Umschalter zugunsten eines einheitlichen Dashboard-Layouts entfernt'
    },
    playground: {
        title: 'Playground',
        description:
            'Visualisiere deine Claws und deren Agenten in einem interaktiven Graphen.',
        subtitle: 'Agenten-Topologie über deine Infrastruktur',
        noClawsYet: 'Keine Claws',
        noClawsDescription:
            'Stelle deinen ersten Claw bereit, um mit ihm zu interagieren.',
        loadingAgents: 'Agenten laden',
        unreachable: 'Nicht erreichbar',
        offline: 'Offline',
        noAgents: 'Keine Agenten',
        agentCount: '{{count}} Agent',
        agentCountPlural: '{{count}} Agenten',
        agentModel: 'Modell',
        zoomLabel: '{{percent}} %',
        fitView: 'Zentrieren',
        nodesOutOfView: 'Claws außerhalb der Ansicht',
        nodeOutOfView: 'Claw außerhalb der Ansicht',
        addAgent: 'Agent hinzufügen',
        closeDetails: 'Schließen',
        tabInfo: 'Info',
        tabLogs: 'Logs',
        tabDiagnostics: 'Zustand',
        tabTerminal: 'Terminal',
        terminalConnecting: 'Verbindung zum Terminal...',
        terminalDisconnected: 'Terminal getrennt.',
        terminalError: 'Verbindung zum Terminal fehlgeschlagen!',
        terminalReconnect: 'Erneut verbinden',
        tabDisabledConfiguring:
            'Verfügbar, sobald die Instanz fertig konfiguriert ist.',
        tabDisabledAwaitingPayment:
            'Verfügbar, sobald die Zahlung verarbeitet wurde.',
        loadingTip1:
            'Wusstest du, dass du mehrere Agenten in einem OpenClaw betreiben kannst?',
        loadingTip2: 'Wusstest du, dass OpenClaw Open Source ist?',
        loadingTip3:
            'ClawHost ist das erste Projekt überhaupt, das Ein-Klick-OpenClaw-Hosting ermöglicht.',
        tabChat: 'Chat',
        tabConfiguration: 'Konfiguration',
        tabSettings: 'Einstellungen',
        tabEnvs: 'Umgebungsvariablen',
        agentOnClaw: 'auf {{clawName}}',
        cannotDeleteDefaultAgent: 'Standardagent kann nicht entfernt werden!',
        configurationModel: 'Modell',
        configurationModelPlaceholder: 'Modell auswählen',
        configurationModelDescription:
            'Das KI-Modell, das dieser Agent verwendet. Das Ändern des Modells kann das Setzen des entsprechenden API-Schlüssels erfordern.',
        configurationEnvVars: 'Umgebungsvariablen',
        configurationEnvVarsDescription:
            'API-Schlüssel und Umgebungsvariablen, gespeichert in ~/.openclaw/.env auf der Instanz.',
        configurationAddEnvVar: 'Variable hinzufügen',
        configurationKeyPlaceholder: 'VARIABLEN_NAME',
        configurationValuePlaceholder: 'Wert',
        configurationSave: 'Speichern',
        configurationSaving: 'Wird gespeichert...',
        configurationSaved: 'Agentenkonfiguration gespeichert.',
        configurationSaveFailed:
            'Agentenkonfiguration konnte nicht gespeichert werden!',
        configurationLoading: 'Konfiguration wird geladen...',
        configurationLoadFailed:
            'Agentenkonfiguration konnte nicht geladen werden!',
        configurationLoadFailedDescription:
            'Die Konfiguration für diesen Agenten konnte nicht abgerufen werden. Bitte versuche es später erneut!',
        configurationRemoveVar: 'Entfernen',
        configurationApiKey: 'API-Schlüssel',
        configurationApiKeyDescription:
            'Erforderlich für {{modelName}}. Dieser Schlüssel wird in ~/.openclaw/.env auf der Instanz gespeichert.',
        configurationApiKeyPlaceholder: 'Gib deinen API-Schlüssel ein',
        tabVariables: 'Variablen',
        variablesDescription:
            'Umgebungsvariablen, gespeichert in ~/.openclaw/.env auf dieser Instanz.',
        variablesEmpty: 'Keine Umgebungsvariablen gefunden.',
        variablesAddVariable: 'Variable hinzufügen',
        variablesSave: 'Variablen speichern',
        variablesSaving: 'Wird gespeichert...',
        variablesSaved: 'Umgebungsvariablen gespeichert.',
        variablesSaveFailed:
            'Umgebungsvariablen konnten nicht gespeichert werden!',
        variablesLoading: 'Variablen werden geladen...',
        variablesLoadFailed: 'Umgebungsvariablen konnten nicht geladen werden!',
        variablesLoadFailedDescription:
            'Variablen für diese Instanz konnten nicht abgerufen werden. Bitte versuche es später erneut!',
        variablesInvalidKey: 'Nur Buchstaben, Zahlen und Unterstriche!',
        variablesEmptyValue: 'Wert darf nicht leer sein!',
        variablesDuplicateKey: 'Doppelter Variablenname!',
        variablesDeleteTitle: 'Variable löschen',
        variablesDeleteDescription:
            'Bist du sicher, dass du {{key}} löschen möchtest? Dies entfernt sie sofort von der Instanz.',
        variablesDeleteConfirm: 'Löschen',
        variablesDontAskAgain:
            'Beim Löschen von Variablen in dieser Sitzung nicht mehr fragen',
        variablesDeleted: 'Variable gelöscht.',
        variablesOperationPending:
            'Deaktiviert, bis ein vorheriger Vorgang abgeschlossen ist.',
        addAgentTitle: 'Agent hinzufügen',
        addAgentDescription: 'Füge einen neuen Agenten zu {{clawName}} hinzu.',
        addAgentDescriptionNoClaw:
            'Wähle einen Claw aus und konfiguriere deinen neuen Agenten.',
        addAgentSelectClaw: 'Claw',
        addAgentSelectClawPlaceholder: 'Claw auswählen',
        addAgentName: 'Name',
        addAgentNamePlaceholder: 'Agentennamen eingeben',
        addAgentModel: 'Modell',
        addAgentModelPlaceholder: 'Modell auswählen',
        addAgentApiKey: 'API-Schlüssel',
        addAgentApiKeyPlaceholder: 'API-Schlüssel eingeben (optional)',
        addAgentApiKeyConfigured:
            '{{envVar}} bereits gesetzt. Änderbar im Tab Variablen nach dem Hinzufügen.',
        addAgentSubmit: 'Agent hinzufügen',
        addAgentSuccess: 'Agent erfolgreich hinzugefügt.',
        addAgentFailed: 'Agent konnte nicht hinzugefügt werden!',
        deleteAgent: 'Agent löschen',
        deleteAgentTitle: 'Agent löschen',
        deleteAgentDescription:
            'Bist du sicher, dass du den Agenten „{{agentName}}" löschen möchtest? Diese Aktion kann nicht rückgängig gemacht werden. Umgebungsvariablen werden nicht entfernt.',
        deleteAgentConfirm: 'Löschen',
        agentDontAskAgain:
            'Beim Löschen von Agenten in dieser Sitzung nicht mehr fragen',
        deleteAgentDeleting: 'Wird gelöscht...',
        deleteAgentSuccess: 'Agent erfolgreich gelöscht.',
        deleteAgentFailed: 'Agent konnte nicht gelöscht werden!',
        configurationName: 'Name',
        configurationNamePlaceholder: 'Agentennamen eingeben',
        configurationNameDescription:
            'Nur Buchstaben, Zahlen und Bindestriche.',
        agentNameRequired: 'Agentenname ist erforderlich!',
        agentNameInvalidChars:
            'Nur Buchstaben, Zahlen und Bindestriche sind erlaubt!',
        agentNameDuplicate: 'Ein Agent mit diesem Namen existiert bereits!',
        chatConnecting: 'Verbindung wird hergestellt...',
        chatAuthenticating: 'Authentifizierung...',
        chatDisconnected: 'Getrennt',
        chatError: 'Verbindungsfehler!',
        chatConnected: 'Verbunden',
        chatInputPlaceholder: 'Nachricht eingeben...',
        chatInputDisabled: 'Verbinde dich, um mit diesem Agenten zu chatten',
        chatSend: 'Nachricht senden',
        chatAbort: 'Stopp',
        chatStopProcess: 'Prozess stoppen',
        chatRemoveAttachment: 'Anhang entfernen',
        chatThinking: 'Denkt nach',
        chatLoadingHistory: 'Nachrichten werden geladen...',
        chatNoMessages: 'Keine Nachrichten',
        chatNoMessagesDescription:
            'Sende eine Nachricht, um eine Unterhaltung mit diesem Agenten zu starten.',
        chatErrorMessage:
            'Beim Generieren einer Antwort ist ein Fehler aufgetreten!',
        chatAbortedMessage: 'Antwort wurde gestoppt.',
        chatPlaySpeech: 'Vorlesen',
        chatReplaySpeech: 'Wiederholen',
        chatStopSpeech: 'Stoppen',
        chatSpeechFailed: 'Sprachgenerierung fehlgeschlagen!',
        chatReadOnlyPlaceholder: 'Chat verfügbar auf deinen eigenen Claws.',
        chatReadOnlyUser:
            'Hallo! Kannst du mir helfen, ein Node.js-Projekt einzurichten?',
        chatReadOnlyAssistant:
            'Natürlich! Ich kann dir helfen, ein neues Node.js-Projekt zu initialisieren. Soll ich eine package.json mit einigen gängigen Abhängigkeiten erstellen?',
        chatReadOnlyReply:
            'Dies ist eine Vorschau! Stelle dein eigenes OpenClaw mit einem Klick bereit und chatte in wenigen Minuten mit deinen KI-Agenten!',
        chatReadOnlyUser2:
            'Kannst du die Testsuite ausführen und auf Fehler prüfen?',
        chatReadOnlyAssistant2:
            'Klar! Ich führe jetzt alle Tests aus. 3 bestanden, 0 fehlgeschlagen. Alles in Ordnung — alle Assertions bestehen.',
        chatReadOnlyGoUser:
            'Hey, kannst du mir helfen, meine Deployment-Pipeline zu automatisieren?',
        chatReadOnlyGoAssistant:
            'Auf jeden Fall! Ich kann eine CI/CD-Pipeline für dich einrichten. Soll ich mit einem GitHub Actions Workflow beginnen, der automatisch baut, testet und deployt?',
        chatReadOnlyGoReply:
            'Dies ist eine Vorschau! Hol dir ClawHost Go und führe OpenClaw lokal aus — dein Rechner, deine Daten, kein Cloud nötig.',
        chatReadOnlyGoUser2:
            'Kannst du meine lokalen Services überwachen und mich warnen, wenn etwas ausfällt?',
        chatReadOnlyGoAssistant2:
            'Bin dran! Ich richte Health-Checks für alle deine Services ein. Überwache aktuell 4 Endpoints — alle gesund und erreichbar.',
        chatConnectionFailed: 'Verbindung zu diesem Agenten fehlgeschlagen!',
        chatConnectionFailedDescription:
            'Stelle sicher, dass der Claw läuft und erreichbar ist!',
        chatNotConfigured: 'Agent nicht konfiguriert!',
        chatNotConfiguredDescription:
            'Wähle ein Modell und setze einen API-Schlüssel im Konfiguration-Tab, um den Chat zu starten.',
        chatConfigureButton: 'Agent konfigurieren',
        chatToday: 'Heute',
        chatYesterday: 'Gestern',
        chatExpandFullscreen: 'Chat erweitern',
        chatAttachFile: 'Datei anhängen',
        chatDropFiles: 'Dateien ablegen zum Anhängen',
        chatDropFilesDescription: 'Bilder, PDFs und Textdateien bis 5 MB.',
        chatVoiceInput: 'Spracheingabe',
        chatVoiceListening: 'Hört zu...',
        chatVoiceNotSupported:
            'Spracheingabe wird in diesem Browser nicht unterstützt!',
        chatVoiceMode: 'Sprachmodus',
        chatVoiceModeTapToSpeak: 'Tippen zum Sprechen',
        chatVoiceModeListening: 'Zuhören...',
        chatVoiceModeClose: 'Sprachmodus beenden',
        chatVoiceModeTranscribing: 'Transkribieren...',
        chatVoiceModeThinking: 'Denken...',
        chatVoiceModeResponding: 'Antworten...',
        chatVoiceModePreparing: 'Sprache vorbereiten...',
        chatVoiceModeSpeaking: 'Sprechen...',
        chatVoiceModeInputDevice: 'Mikrofon',
        chatVoiceModeOutputDevice: 'Lautsprecher',
        chatVoiceModeNotSupported:
            'Spracherkennung wird in diesem Browser nicht unterstützt.',
        chatVoiceModeNoMicrophone:
            'Kein Mikrofon erkannt. Verbinde eines, um den Sprachmodus zu verwenden.',
        chatVoiceModeNoSpeaker:
            'Kein Lautsprecher erkannt. Verbinde einen, um den Sprachmodus zu verwenden.',
        chatAttachmentNotSupported:
            'Dieser Dateityp wird nicht unterstützt. Verwende Bilder, PDFs oder Textdateien!',
        chatNoPreview: 'Keine Vorschau verfügbar.',
        chatDownloadFile: 'Datei herunterladen',
        chatCopyMessage: 'Nachricht kopieren',
        tabChannels: 'Kanäle',
        channelsDescription:
            'Konfiguriere Messaging-Kanäle für diese Instanz. Nachrichten werden über Bindungen an Agenten weitergeleitet.',
        channelsWhatsApp: 'WhatsApp',
        channelsWhatsAppPairDevice: 'Gerät koppeln',
        channelsWhatsAppPairing: 'Warte auf QR-Code...',
        channelsWhatsAppScanQr:
            'Scanne diesen QR-Code mit WhatsApp, um dein Gerät zu koppeln.',
        channelsWhatsAppScanInstructions:
            'Öffne WhatsApp > Einstellungen > Verknüpfte Geräte > Gerät hinzufügen',
        channelsWhatsAppQrRefreshed:
            'Der vorherige QR-Code ist abgelaufen. Scanne den neuen unten.',
        channelsWhatsAppPaired: 'WhatsApp erfolgreich gekoppelt.',
        channelsWhatsAppPairFailed:
            'Kopplung fehlgeschlagen. Bitte versuche es erneut!',
        channelsWhatsAppAlreadyPaired: 'WhatsApp ist bereits gekoppelt!',
        channelsWhatsAppUnpair: 'Entkoppeln',
        channelsWhatsAppConnected: 'Verbunden',
        channelsWhatsAppRepair: 'Neu koppeln',
        channelsWhatsAppChecking: 'Verbindung wird überprüft...',
        channelsVersionUnsupported:
            'Die Kanalkonfiguration ist in dieser Version nicht verfügbar. Sie können manuell über den Terminal-Tab verbinden oder OpenClaw aktualisieren.',
        channelsVersionUnsupportedDocs: 'Einrichtungsanleitung anzeigen',
        channelsTelegram: 'Telegram',
        channelsDiscord: 'Discord',
        channelsSlack: 'Slack',
        channelsSignal: 'Signal',
        channelsEnabled: 'Aktiviert',
        channelsAccount: 'Konto-Telefonnummer',
        channelsAccountPlaceholder: '+49151234567',
        channelsBotToken: 'Bot-Token',
        channelsBotTokenPlaceholder: 'Bot-Token eingeben',
        channelsAppToken: 'App-Token',
        channelsAppTokenPlaceholder: 'App-Token eingeben',
        channelsToken: 'Bot-Token',
        channelsTokenPlaceholder: 'Bot-Token eingeben',
        channelsSigningSecret: 'Signaturgeheimnis',
        channelsSigningSecretPlaceholder: 'Signaturgeheimnis eingeben',
        channelsDmPolicy: 'DM-Richtlinie',
        channelsDmPolicyOpen: 'Offen',
        channelsDmPolicyPairing: 'Kopplung',
        channelsDmPolicyAllowlist: 'Erlaubnisliste',
        channelsDmPolicyDisabled: 'Deaktiviert',
        channelsAllowFrom: 'Erlauben von',
        channelsAllowFromPlaceholder: 'Erlaubte IDs, kommagetrennt',
        channelsSave: 'Speichern',
        channelsSaved: 'Kanäle erfolgreich aktualisiert.',
        channelsSaveFailed: 'Kanäle konnten nicht aktualisiert werden!',
        channelsLoading: 'Kanäle werden geladen...',
        channelsLoadFailed: 'Kanäle konnten nicht geladen werden!',
        channelsLoadFailedDescription:
            'Kanalkonfiguration konnte nicht abgerufen werden. Bitte versuche es erneut!',
        channelsNoChanges: 'Keine Änderungen zum Speichern.',
        bindingsDescription:
            'Weise diesem Agenten Messaging-Kanäle zu. Jeder Kanal kann nur einem Agenten gleichzeitig zugewiesen werden.',
        bindingsNoChannels: 'Keine Kanäle aktiviert.',
        bindingsNoChannelsDescription:
            'Aktiviere zuerst Kanäle in den Instanz-Einstellungen und weise sie dann hier den Agenten zu.',
        bindingsSaving: 'Wird gespeichert...',
        bindingsSaved: 'Bindungen erfolgreich aktualisiert.',
        bindingsSaveFailed: 'Fehler beim Aktualisieren der Bindungen!',
        tabSkills: 'Skills',
        skillsDescription:
            'Verwalte gemeinsame Skills, die allen Agenten auf dieser Instanz zur Verfügung stehen.',
        skillsSearch: 'Skills suchen...',
        skillsNoResults: 'Keine Skills entsprechen deiner Suche.',
        skillsEmpty: 'Keine Skills',
        skillsSave: 'Skills speichern',
        skillsSaved: 'Skills erfolgreich aktualisiert.',
        skillsSaveFailed: 'Skills konnten nicht aktualisiert werden!',
        skillsLoading: 'Skills werden geladen...',
        skillsLoadFailed: 'Skills konnten nicht geladen werden!',
        skillsLoadFailedDescription:
            'Skills-Konfiguration konnte nicht abgerufen werden. Bitte versuche es erneut!',
        agentSkillsDescription:
            'In diesem Agenten-Arbeitsbereich installierte Skills.',
        agentSkillsInstalling: 'Wird installiert...',
        agentSkillsInstalled: 'Skill erfolgreich installiert.',
        agentSkillsInstallFailed: 'Skill konnte nicht installiert werden!',
        agentSkillsRemoving: 'Wird entfernt...',
        agentSkillsRemoved: 'Skill erfolgreich entfernt.',
        agentSkillsRemoveFailed: 'Skill konnte nicht entfernt werden!',
        agentSkillsEmpty: 'Keine Skills installiert.',
        agentSkillsEmptyDescription:
            'Installiere einen Skill, um die Fähigkeiten dieses Agenten zu erweitern.',
        agentSkillsNamePlaceholder: 'Skill-Name',
        agentSkillsConfirmRemove: 'Skill „{{skillName}}" entfernen?',
        agentSkillsConfirmRemoveDescription:
            'Dies löscht den Skill aus dem Agenten-Arbeitsbereich.',
        skillsBundledTab: 'Gebündelt',
        skillsClawHubTab: 'ClawHub',
        clawHubSearch: 'ClawHub-Skills suchen...',
        clawHubNoResults: 'Keine Skills auf ClawHub gefunden.',
        clawHubEmpty: 'Keine ClawHub-Skills installiert.',
        clawHubEmptyDescription:
            'Suche und installiere Skills vom ClawHub-Marktplatz.',
        clawHubInstall: 'Installieren',
        clawHubInstalled: 'Skill von ClawHub installiert.',
        clawHubInstallFailed:
            'Skill von ClawHub konnte nicht installiert werden!',
        clawHubRemove: 'Entfernen',
        clawHubRemoved: 'ClawHub-Skill entfernt.',
        clawHubRemoveFailed: 'ClawHub-Skill konnte nicht entfernt werden!',
        clawHubUpdate: 'Aktualisieren',
        clawHubUpdated: 'Skill von ClawHub aktualisiert.',
        clawHubUpdateFailed: 'ClawHub-Skill konnte nicht aktualisiert werden!',
        clawHubUpdateAvailable: 'v{{version}} verfügbar',
        clawHubBy: 'von {{author}}',
        clawHubDownloads: '{{count}} Downloads',
        clawHubVersion: 'v{{version}}',
        clawHubLoadFailed: 'ClawHub konnte nicht geladen werden!',
        clawHubLoadFailedDescription:
            'Verbindung zum ClawHub-Marktplatz konnte nicht hergestellt werden. Bitte versuche es erneut!',
        tabVersions: 'Versionen',
        versionsSearch: 'Versionen suchen...',
        versionsEmpty: 'Keine Versionen gefunden',
        versionsEmptyDescription:
            'Keine Versionen stimmen mit Ihrer Suche überein.',
        versionsErrorDescription:
            'Versionen konnten nicht geladen werden. Bitte überprüfen Sie Ihre Verbindung und versuchen Sie es erneut!',
        versionsChangelog: 'Changelogs auf npm ansehen',
        versionCurrent: 'Aktuell',
        versionLatest: 'Neueste',
        versionInstall: 'Installieren',
        versionInstalling: 'Installiert...',
        versionInstallSuccess: 'Version {{version}} erfolgreich installiert.',
        versionInstallFailed: 'Version konnte nicht installiert werden!',
        versionDownloads: '{{count}} Downloads',
        versionChangelog: 'Changelog',
        versionOutdated: 'Veraltet',
        versionInstallConfirmTitle: 'Version {{version}} installieren',
        versionInstallConfirmDescription:
            'Ein Versionswechsel kann unerwartetes Verhalten verursachen oder zusätzliche manuelle Konfiguration erfordern, insbesondere bei neueren Versionen, die noch nicht vollständig überprüft wurden. Möchten Sie fortfahren?',
        settingsName: 'Name',
        settingsNamePlaceholder: 'Claw-Name eingeben',
        settingsNameDescription: 'Nur Buchstaben, Zahlen und Bindestriche.',
        subdomain: 'Subdomain',
        subdomainPlaceholder: 'Subdomain eingeben',
        subdomainDescription:
            'Kleinbuchstaben und Zahlen, {{min}}-{{max}} Zeichen.',
        subdomainInvalid:
            'Nur {{min}}-{{max}} Kleinbuchstaben und Zahlen verwenden!',
        subdomainUpdated: 'Subdomain erfolgreich aktualisiert.',
        subdomainUpdateFailed: 'Subdomain konnte nicht aktualisiert werden!',
        subdomainInUse:
            'Diese Subdomain wird bereits von einem anderen Claw verwendet!',
        settingsSave: 'Speichern',
        settingsSaving: 'Speichern...',
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
        title: 'Datenschutzerklärung',
        description:
            'Erfahre, wie ClawHost deine personenbezogenen Daten erhebt, verwendet und schützt.',
        lastUpdated: 'Zuletzt aktualisiert: 14. März 2026',
        introTitle: '1. Einleitung',
        introText:
            'ClawHost („wir", „unser" oder „uns") ist dem Schutz deiner Privatsphäre verpflichtet. Diese Datenschutzerklärung erläutert, wie wir deine Daten erheben, verwenden, offenlegen und schützen, wenn du unseren Dienst nutzt.',
        authTitle: '2. Authentifizierung',
        authText:
            'ClawHost verwendet Google Firebase Authentication zur Verwaltung von Benutzerkonten. Du kannst dich mit E-Mail, Google oder GitHub anmelden. Durch die Nutzung dieser Anmeldemethoden stimmst du den jeweiligen Nutzungsbedingungen und Datenschutzerklärungen zu. Diese Anbieter können grundlegende Daten wie deine E-Mail-Adresse, deinen Namen und Geräteinformationen erheben. Wir speichern nur deine E-Mail-Adresse und deinen Anzeigenamen.',
        collectTitle: '3. Von uns erhobene Daten',
        collectText: 'Wir erheben Daten auf folgende Weise:',
        personalInfoTitle: 'Personenbezogene Daten',
        personalInfoEmail:
            'E-Mail-Adresse (für Kontoerstellung und Kommunikation)',
        personalInfoName: 'Name (optional, zur Personalisierung)',
        personalInfoPayment:
            'Zahlungsinformationen (werden sicher durch Drittanbieter verarbeitet)',
        serverInfoTitle: 'Serverinformationen',
        serverInfoConfig:
            'Serverkonfiguration und -status (gehostet auf Hetzner Cloud)',
        serverInfoIp: 'Server-IP-Adresse und -Standort',
        serverInfoResources: 'Ressourcenzuweisung (CPU, RAM, Speicher)',
        useTitle: '4. Verwendung deiner Daten',
        useText: 'Wir verwenden die erhobenen Daten, um:',
        useProvide: 'Unseren Dienst bereitzustellen und zu pflegen',
        useTransactions:
            'Transaktionen zu verarbeiten und Abrechnungsinformationen zu senden',
        useNotices: 'Wichtige Hinweise und Updates zu senden',
        useSupport: 'Auf Supportanfragen zu reagieren',
        useAnalyze:
            'Nutzungsmuster zu überwachen und zu analysieren, um unseren Dienst zu verbessern',
        useFraud: 'Betrug oder Missbrauch zu erkennen und zu verhindern',
        sharingTitle: '5. Datenweitergabe und Offenlegung',
        sharingText:
            'Wir verkaufen deine personenbezogenen Daten nicht. Wir können Daten teilen mit:',
        sharingProviders:
            'Dienstleistern, die uns beim Betrieb unseres Dienstes unterstützen (z. B. Cloud-Infrastrukturanbieter)',
        sharingLegal:
            'Behörden, wenn dies gesetzlich vorgeschrieben ist oder um unsere Rechte zu schützen',
        sharingBusiness:
            'Geschäftspartnern im Falle einer Fusion, Übernahme oder eines Verkaufs von Vermögenswerten',
        securityTitle: '6. Datensicherheit',
        securityText:
            'Wir setzen angemessene technische und organisatorische Maßnahmen ein, um deine personenbezogenen Daten gegen unbefugten Zugriff, Änderung, Offenlegung oder Zerstörung zu schützen. Dazu gehören Verschlüsselung, sichere Server und regelmäßige Sicherheitsbewertungen.',
        retentionTitle: '7. Datenspeicherung',
        retentionText:
            'Wir speichern deine personenbezogenen Daten, solange dein Konto aktiv ist oder es für die Bereitstellung unserer Dienste erforderlich ist. Bestimmte Daten können wir aufgrund gesetzlicher Verpflichtungen oder berechtigter Geschäftsinteressen aufbewahren.',
        rightsTitle: '8. Deine Rechte',
        rightsText: 'Je nach Standort hast du möglicherweise das Recht auf:',
        rightsAccess: 'Zugang zu deinen personenbezogenen Daten',
        rightsCorrect: 'Berichtigung unrichtiger Daten',
        rightsDelete: 'Löschung deiner Daten',
        rightsObject: 'Widerspruch gegen die Verarbeitung deiner Daten',
        rightsPortability: 'Datenübertragbarkeit',
        rightsWithdraw: 'Widerruf der Einwilligung jederzeit',
        cookiesTitle: '9. Cookies und Tracking',
        cookiesText:
            'Wir verwenden keine Cookies. Die Authentifizierung wird über Firebase abgewickelt und ist nicht auf in deinem Browser gespeicherte Cookies angewiesen.',
        transfersTitle: '10. Internationale Datenübermittlungen',
        transfersText:
            'Deine Daten können in andere Länder als dein eigenes übermittelt und dort verarbeitet werden. Wir stellen sicher, dass angemessene Schutzmaßnahmen zum Schutz deiner Daten gemäß dieser Datenschutzerklärung vorhanden sind.',
        eligibilityTitle: '11. Berechtigung',
        eligibilityText:
            'Unser Dienst steht jedem zur Verfügung. Es gibt keine Altersbeschränkungen für die Nutzung von ClawHost.',
        changesTitle: '12. Änderungen dieser Richtlinie',
        changesText:
            'Wir können diese Datenschutzerklärung von Zeit zu Zeit aktualisieren. Wir werden dich über Änderungen informieren, indem wir die neue Datenschutzerklärung auf dieser Seite veröffentlichen und das Datum „Zuletzt aktualisiert" anpassen.',
        contactTitle: '13. Kontakt',
        contactText:
            'Bei Fragen zu dieser Datenschutzerklärung oder zur Ausübung deiner Rechte kontaktiere uns bitte unter'
    },
    terms: {
        title: 'Nutzungsbedingungen',
        description:
            'Lies die Geschäftsbedingungen für die Nutzung der ClawHost-Dienste.',
        lastUpdated: 'Zuletzt aktualisiert: 14. März 2026',
        acceptanceTitle: '1. Annahme der Bedingungen',
        acceptanceText:
            'Durch den Zugriff auf und die Nutzung von ClawHost („Dienst") akzeptierst du die Bedingungen und Bestimmungen dieser Vereinbarung und erklärst dich damit einverstanden, daran gebunden zu sein. Wenn du diesen Bedingungen nicht zustimmst, nutze bitte unseren Dienst nicht.',
        serviceTitle: '2. Beschreibung des Dienstes',
        serviceText:
            'ClawHost bietet Ein-Klick-OpenClaw-Bereitstellung auf dedizierten Servern. Wir ermöglichen es Benutzern, vorkonfigurierte OpenClaw-Instanzen mit vollem Root-Zugriff und dedizierten Ressourcen bereitzustellen, zu verwalten und darauf zuzugreifen.',
        authTitle: '3. Authentifizierung',
        authText:
            'ClawHost verwendet Google Firebase Authentication zur Anmeldungsverwaltung. Du kannst dich mit E-Mail, Google oder GitHub authentifizieren. Durch die Nutzung dieser Methoden stimmst du den jeweiligen Nutzungsbedingungen und Datenschutzerklärungen von Google und GitHub zu. Diese Anbieter können grundlegende Daten wie deine E-Mail-Adresse, deinen Namen und Gerätedaten erheben.',
        responsibilitiesTitle: '4. Benutzerpflichten',
        responsibilitiesText: 'Du stimmst zu:',
        responsibilitiesAccurate:
            'Genaue und vollständige Registrierungsdaten anzugeben',
        responsibilitiesSecurity:
            'Die Sicherheit deiner Kontodaten zu gewährleisten',
        responsibilitiesCompliance:
            'Den Dienst unter Einhaltung aller geltenden Gesetze zu nutzen',
        responsibilitiesLegal:
            'Den Dienst nicht für illegale oder unbefugte Zwecke zu nutzen',
        responsibilitiesAccess:
            'Keinen unbefugten Zugriff auf Systeme oder Netzwerke zu versuchen',
        prohibitedTitle: '5. Verbotene Nutzung',
        prohibitedText: 'Du darfst unseren Dienst nicht verwenden, um:',
        prohibitedMalware:
            'Malware, Viren oder sonstige schädliche Software zu verbreiten',
        prohibitedDos:
            'Denial-of-Service-Angriffe oder Netzwerkmissbrauch durchzuführen',
        prohibitedSpam: 'Spam oder unerwünschte Kommunikation zu versenden',
        prohibitedIllegal: 'Illegale Inhalte zu hosten oder zu verbreiten',
        prohibitedIp:
            'Rechte Dritter einschließlich geistigen Eigentums zu verletzen',
        prohibitedMining: 'Kryptowährung zu schürfen',
        prohibitedOther:
            'Jede andere rechtswidrige oder schädliche Aktivität, die wir nach eigenem Ermessen als unangemessen erachten',
        paymentTitle: '6. Zahlung und Abrechnung',
        paymentText:
            'Dienste werden monatlich oder jährlich pauschal abgerechnet. Du kannst jederzeit zwischen monatlicher und jährlicher Abrechnung wechseln, wobei die Änderung zu Beginn deines nächsten Abrechnungszeitraums wirksam wird. Alle Zahlungen sind nicht erstattungsfähig. Wenn du für einen Server zahlst, hast du für den gesamten Abrechnungszeitraum Zugriff darauf. Bei einer Kündigung wird diese am Ende des aktuellen Abrechnungszeitraums wirksam. Preise können sich ändern, jedoch gelten Änderungen nur für neu bereitgestellte Claws und haben keinen Einfluss auf bereits bestehende. Nichtzahlung kann zur Aussetzung oder Kündigung deines Kontos führen.',
        availabilityTitle: '7. Dienstverfügbarkeit',
        availabilityText:
            'Wir bemühen uns um hohe Verfügbarkeit, garantieren jedoch keinen ununterbrochenen Zugang zum Dienst. Wir behalten uns das Recht vor, Teile des Dienstes jederzeit mit oder ohne Vorankündigung zu ändern, auszusetzen oder einzustellen.',
        liabilityTitle: '8. Haftungsbeschränkung',
        liabilityText:
            'Im größtmöglichen gesetzlich zulässigen Umfang haftet ClawHost nicht für indirekte, zufällige, besondere, Folge- oder Strafschäden oder für entgangene Gewinne oder Einnahmen, unabhängig davon, ob sie direkt oder indirekt entstanden sind.',
        terminationTitle: '9. Kündigung',
        terminationText:
            'Wir können dein Konto und den Zugang zum Dienst sofort und ohne vorherige Ankündigung sperren oder kündigen, wenn wir der Ansicht sind, dass dein Verhalten gegen diese Bedingungen verstößt oder anderen Nutzern, uns oder Dritten schadet, oder aus jedem anderen Grund.',
        changesToTermsTitle: '10. Änderungen der Bedingungen',
        changesToTermsText:
            'Wir behalten uns das Recht vor, diese Bedingungen jederzeit zu ändern. Wir werden Benutzer über wesentliche Änderungen per E-Mail oder über den Dienst informieren. Die fortgesetzte Nutzung des Dienstes nach solchen Änderungen gilt als Annahme der aktualisierten Bedingungen.',
        contactTitle: '11. Kontaktinformationen',
        contactText:
            'Bei Fragen zu diesen Bedingungen kontaktiere uns bitte unter'
    },
    mobile: {
        messages: 'Nachrichten',
        settings: 'Einstellungen',
        comingSoon: 'Demnächst',
        messagesPlaceholder:
            'Nachrichten und Benachrichtigungen werden hier angezeigt.',
        settingsPlaceholder:
            'Kontoeinstellungen und Präferenzen werden hier angezeigt.',
        signIn: 'Anmelden',
        signInDescription:
            'Melde dich an, um deine OpenClaw-Instanzen zu verwalten.',
        enterEmail: 'E-Mail-Adresse',
        emailPlaceholder: 'beispiel@clawhost.cloud',
        continueWithEmail: 'Weiter mit E-Mail',
        otpDescription:
            'Wir senden dir einen Code zum Anmelden. Kein Passwort nötig.',
        sending: 'Wird gesendet...',
        checkYourEmail: 'Prüfe deine E-Mail',
        codeSentTo: 'Wir haben einen 6-stelligen Code gesendet an',
        enterCode: 'Gib den Code aus deiner E-Mail ein',
        resendCode: 'Code erneut senden',
        resendIn: 'Erneut senden in {{seconds}}s',
        changeEmail: 'E-Mail ändern',
        invalidCode: 'Ungültiger Code!',
        codeExpired: 'Code abgelaufen. Bitte fordere einen neuen an!',
        signingIn: 'Anmeldung...',
        signOut: 'Abmelden',
        signedInAs: 'Angemeldet als',
        loadMore: 'Mehr laden',
        chatWithYourClaw: 'Chatte mit deinem Claw',
        deployClaw: 'Claw bereitstellen',
        deployYourFirstClaw: 'Stelle deinen ersten Claw bereit',
        voiceMode: 'Sprachmodus',
        voiceListening: 'Zuhören...',
        voiceTapToSpeak: 'Tippe auf die Kugel zum Starten'
    },
    announcement: {
        title: 'Servicehinweis',
        message:
            'Aufgrund hoher Nachfrage sind {{providers}}-Bereitstellungen vorübergehend nicht verfügbar. Bestehende Claws laufen normal.'
    },
    productHunt: {
        liveOn: 'Live auf',
        productHunt: 'Product Hunt',
        celebrate: 'Unterstütze uns & genieße',
        discount: '10% Rabatt',
        yourFirstMonth: 'auf deine erste Bestellung',
        upvoteNow: 'Stimme für uns'
    },
    compare: {
        title: 'Vollständiger Vergleich',
        description:
            'Erfahre, wie sich ClawHost von anderen OpenClaw-Hosting-Plattformen unterscheidet.',
        badge: 'Vergleich',
        feature: 'Plattform',
        compareWith: 'Vergleichen mit',
        lastUpdated: 'Zuletzt aktualisiert: März 2026',
        competitorClawHost: 'ClawHost',
        competitorLobsterFarm: 'LobsterFarm',
        competitorSimpleClaw: 'SimpleClaw',
        competitorMyClawAi: 'MyClaw.ai',
        competitorQuickClaw: 'QuickClaw',
        categoryInfrastructure: 'Infrastruktur',
        categoryPricing: 'Preise & Abrechnung',
        categoryDeployment: 'Bereitstellung & Einrichtung',
        categoryManagement: 'OpenClaw-Verwaltung',
        categorySecurity: 'Daten & Sicherheit',
        categoryMonitoring: 'Überwachung & Wartung',
        categorySupport: 'Support & Plattform',
        featureServerOwnership: 'Server-Eigentum',
        featureProviderChoice: 'Cloud-Anbieter-Auswahl',
        featureDedicatedResources: 'Dedizierte Ressourcen',
        featureRootAccess: 'Voller Root-/SSH-Zugang',
        featureServerLocations: 'Serverstandorte',
        featureStartingPrice: 'Einstiegspreis',
        featureTransparentPricing: 'Transparente Preise',
        featurePowerfulServers: 'Leistungsstarke Server, günstiger Preis',
        featureLocationSelection: 'Serverstandort auswählen',
        featureSubdomainAccess: 'Zugang über Subdomain',
        featureThemes: 'Helles und dunkles Theme',
        featureSetupTime: 'Einrichtungszeit',
        featureTechnicalSkill: 'Technische Kenntnisse erforderlich',
        featureOneClickDeploy: 'Ein-Klick-Bereitstellung',
        featureMultipleInstances: 'Mehrere Instanzen',
        featureMultipleAgents: 'Mehrere Agenten pro Instanz',
        featureSkillsMarketplace: 'Skills-Marktplatz',
        featureChannelSupport: 'Kanal-Unterstützung',
        featureAgentConfig: 'Agenten-Konfiguration',
        featureDataOwnership: 'Vollständiges Dateneigentum',
        featureDataExport: 'Datenexport',
        featureBackups: 'Backups',
        featureSecurityHardening: 'Sicherheitshärtung',
        featureSslTls: 'SSL/TLS',
        featureOpenSource: 'Open Source',
        featureAutoUpdates: 'Automatische Updates',
        featureDiagnostics: 'Echtzeit-Diagnose',
        featureLogStreaming: 'Log-Streaming',
        featureRepairTools: 'Reparatur-Tools',
        featureSupportChannels: 'Support-Kanäle',
        featureMultiLanguage: 'Mehrsprachige Oberfläche',
        featureMobileApp: 'Mobile App',
        featureDesktopApp: 'Desktop-App',
        featureDirectChat: 'Direkter Chat',
        featureOneClickVersion: 'Versionswechsel mit einem Klick',
        featureWebTerminal: 'Web-Terminal',
        featureSocials: 'Soziale Medien',
        dedicatedVps: 'Dedizierter VPS',
        sharedContainers: 'Geteilte Container',
        isolatedContainers: 'Isolierte Container',
        cloudWorkspaces: 'Cloud-Arbeitsbereiche',
        threeProviders: 'Hetzner Cloud',
        singleProvider: 'Einzelner Anbieter',
        fullyDedicated: 'Vollständig dediziert',
        shared: 'Geteilt',
        fullRootSsh: 'Vollständiger Root + SSH',
        sshOnRequest: 'SSH auf Anfrage',
        noAccess: 'Kein Zugang',
        thirtyPlusLocations: '30+ Standorte',
        limitedLocations: 'Begrenzt',
        fourLocations: '4 Standorte',
        fromTwentyFiveMonth: 'Ab 25 $/Monat',
        aboutFortyFourMonth: '~44 $/Monat durchschnittlich',
        fromNineteenMonth: '19–79 $/Monat',
        nineteenMonth: '19 $/Monat',
        clearSpecsPricing: 'Klare Spezifikationen & Preise',
        unclearPricing: 'Unklare Preise',
        fixedTiers: '3 feste Stufen',
        creditBased: 'Kreditbasiert',
        minutes: 'Minuten',
        underOneMinute: 'Unter 1 Minute',
        thirtySeconds: '30 Sekunden',
        instant: 'Sofort',
        noneRequired: 'Keine',
        minimal: 'Minimal',
        unlimited: 'Unbegrenzt',
        singleInstance: 'Einzeln',
        fiveThousandSkills: '5.000+ Skills (ClawHub)',
        noMarketplace: 'Kein Marktplatz',
        allChannels: 'WhatsApp, Telegram, Discord, Slack, Signal',
        telegramDiscord: 'Telegram, Discord',
        discordGithubSlack: 'Discord, GitHub, Slack',
        telegramGmailWhatsapp: 'Telegram, Gmail, WhatsApp',
        appOnly: 'Nur App',
        fullConfig: 'Vollständige Konfiguration',
        limitedConfig: 'Begrenzt',
        zipExport: 'ZIP-Export',
        serverTransfer: 'Servertransfer',
        noExport: 'Kein Export',
        volumeStorage: 'Volume-Speicher',
        noBackups: 'Keine Backups',
        dailyBackups: 'Tägliche Backups',
        included: 'Enthalten',
        notIncluded: 'Nicht enthalten',
        managed: 'Verwaltet',
        manual: 'Manuell',
        appStore: 'App Store',
        liveMonitoring: 'Live-Überwachung',
        liveLogs: 'Live-Logs',
        oneClickRepair: 'Ein-Klick-Reparatur',
        emailGithub: 'E-Mail, GitHub',
        humanSupport: 'Menschlicher Support',
        communityOnly: 'Nur Community',
        appSupport: 'App-Support',
        prioritySupport: '24/7-Support (Pro+)',
        fourLanguages: '4 Sprachen',
        englishOnly: 'Nur Englisch',
        available: 'Verfügbar',
        comingSoon: 'Demnächst verfügbar',
        iosMacOs: 'iOS & macOS',
        macOsOnly: 'Nur macOS',
        viaTelegram: 'Über Telegram',
        builtInChat: 'Integriert',
        builtInTerminal: 'Kein SSH nötig',
        notAvailable: 'Nicht verfügbar',
        disclaimer: 'Etwas geändert oder falsch? Schreib uns an',
        disclaimerOr: 'oder öffne einen Pull Request auf',
        github: 'GitHub',
        ctaTitle: 'Bereit, den Unterschied zu sehen?',
        ctaDescription:
            'Stelle OpenClaw auf deinem eigenen dedizierten Server bereit. Vollständiges Eigentum, transparente Preise und in Minuten einsatzbereit.'
    }
} as const

export default de