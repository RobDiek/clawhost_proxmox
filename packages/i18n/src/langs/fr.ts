import type { Translations } from '../types'

const fr: Translations = {
    common: {
        loading: 'Chargement...',
        save: 'Enregistrer',
        cancel: 'Annuler',
        confirm: 'Confirmer',
        delete: 'Supprimer',
        deleting: 'Suppression...',
        back: 'Retour',
        create: 'Créer',
        done: 'Terminé',
        copy: 'Copier',
        copied: 'Copié.',
        copiedWithLabel: '{{label}} copié.',
        show: 'Afficher',
        hide: 'Masquer',
        tryAgain: 'Réessayer',
        addKey: 'Ajouter une clé',
        close: 'Fermer',
        none: 'Aucun',
        all: 'Tout',
        unknown: 'Inconnu',
        pageNotFound: 'Page introuvable',
        closeNotification: 'Fermer la notification',
        beta: 'Bêta',
        brandName: 'ClawHost',
        brandNameGo: 'ClawHost Go',
        brandNameGoVersion: 'ClawHost Go {{version}}',
        menuFile: 'Fichier',
        menuEdit: 'Édition',
        menuView: 'Présentation',
        menuWindow: 'Fenêtre',
        menuHelp: 'Aide',
        legalEmail: 'legal@clawhost.cloud',
        scrollToBottom: 'Défiler vers le bas',
        second: 'seconde',
        seconds: 'secondes'
    },
    setup: {
        welcomeTitle: 'Bienvenue sur ClawHost Go',
        welcomeDescription: 'Configurez votre profil pour commencer.',
        whatsYourName: 'Comment vous appelez-vous ?',
        namePlaceholder: 'Entrez votre nom',
        nameHint: 'Vous pouvez toujours le définir plus tard.',
        getStarted: 'Commencer'
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
        switchLanguage: 'Langue'
    },
    theme: {
        light: 'Clair',
        dark: 'Sombre',
        system: 'Système',
        toggleTheme: 'Changer le thème'
    },
    nav: {
        claws: 'Claws',
        playground: 'Playground',
        sshKeys: 'Clés SSH',
        account: 'Compte',
        billing: 'Facturation',
        affiliate: 'Affiliation',
        license: 'Licence',
        signOut: 'Se déconnecter',
        admin: 'Admin',
        login: 'Connexion',
        deploy: 'Déployer',
        deployOpenClaw: 'Déployer OpenClaw',
        mainNavigation: 'Navigation principale',
        footerNavigation: 'Navigation du pied de page',
        toggleMenu: 'Ouvrir le menu',
        cloud: 'Cloud',
        cloudSubtitle: 'Technique',
        go: 'Go',
        goSubtitle: 'Non-technique'
    },
    go: {
        pageTitle: 'ClawHost Go',
        heroTitle1: 'Déployez OpenClaw.',
        heroTitle2: 'Localement. Instantanément.',
        badge: 'Bientôt disponible',
        comingSoon: 'Bientôt disponible',
        description:
            'Un client de bureau léger pour gérer vos instances OpenClaw. Déployez, surveillez et contrôlez vos claws — directement depuis votre machine.',
        download: 'Télécharger pour {{os}}',
        downloadWindows: 'Windows',
        downloadMac: 'macOS',
        selfHostInstead: 'Auto-héberger plutôt',
        features: 'Fonctionnalités',
        whyClawHostGo: 'Fonctions tout-en-un',
        featuresDescription:
            "Pourquoi nous valons le coup d\'essayer, les fonctionnalités parlent d\'elles-mêmes.",
        zeroConfigDescription:
            'Installez et lancez. Aucune configuration serveur ni cloud. OpenClaw est prêt en quelques secondes.',
        ownedDataDescription:
            'Tout fonctionne sur votre appareil. Pas de serveurs cloud, pas de tiers, aucune donnée ne quitte votre machine.',
        terminalAccessDescription:
            "Accédez au terminal de votre instance OpenClaw directement depuis l\'application. Aucun client SSH externe requis.",
        simplePricing: 'Tarification simple',
        simplePricingDescription:
            'Une licence, tout illimité. Pas de factures mensuelles, pas de limites, pas de frais cachés.',
        localDomain: 'Domaine local personnalisé',
        localDomainDescription:
            'Accédez à votre OpenClaw via un domaine local personnalisé. Des URLs propres sur votre réseau.',
        secureDescription:
            'Vos données ne quittent jamais votre appareil. Entièrement isolé, entièrement chiffré, entièrement à vous.',
        pricing: 'Tarifs',
        pricingTitle: 'Tarif unique et simple',
        pricingDescription:
            "Pas d'abonnement, pas de frais cachés. Une licence, utilisation illimitée.",
        pricingPrice: '{{price}} $',
        pricingLabel: 'Paiement unique',
        pricingFeature1: 'Licence à vie',
        pricingFeature2: 'Claws illimités',
        pricingFeature3: 'Toutes les mises à jour futures',
        pricingFeature4: "Aucune limite d'utilisation",
        pricingFeature5: 'Support prioritaire',
        pricingFeature6: 'Domaine local personnalisé',
        pricingCta: 'Obtenir ClawHost Go',
        comparison: 'Comparaison',
        comparisonTitle: 'Go vs Cloud',
        comparisonDescription:
            'Choisissez ce qui vous convient. Go fonctionne localement, Cloud sur des serveurs dédiés.',
        comparisonLocalUs: 'Fonctionne entièrement sur votre appareil',
        comparisonLocalOthers: 'Fonctionne sur des serveurs distants',
        comparisonPricingUs: 'Paiement unique',
        comparisonPricingOthers: 'Abonnement mensuel',
        comparisonDataUs: 'Les données restent sur votre machine',
        comparisonDataOthers: 'Données sur des serveurs cloud',
        comparisonSetupUs: 'Installer et lancer instantanément',
        comparisonSetupOthers: 'Déployer en un clic',
        comparisonUpdatesUs: 'Mises à jour automatiques',
        comparisonUpdatesOthers: 'Mises à jour automatiques',
        comparisonAgentsUs: 'Agents multiples',
        comparisonAgentsOthers: 'Agents multiples',
        faqTitle: 'Questions',
        faqHeading: 'Questions fréquentes',
        faqDescription: 'Tout ce que vous devez savoir sur ClawHost Go.',
        faq1Question: "Qu'est-ce que ClawHost Go ?",
        faq1Answer:
            "ClawHost Go est une application de bureau légère qui vous permet d'exécuter OpenClaw localement sur votre machine. Pas de serveurs cloud nécessaires — installez, lancez et utilisez OpenClaw en quelques secondes.",
        faq2Question: 'Quelle est la différence entre Go et ClawHost Cloud ?',
        faq2Answer:
            "ClawHost Cloud déploie OpenClaw sur des serveurs distants dédiés avec une disponibilité 24h/24 et un accès mondial. ClawHost Go fait tout tourner localement sur votre appareil — idéal pour la confidentialité, l'utilisation hors ligne et les configurations simples.",
        faq3Question: "Ai-je besoin d'une connexion internet ?",
        faq3Answer:
            "ClawHost Go fonctionne hors ligne pour une utilisation locale. Une connexion internet n'est nécessaire que pour la configuration initiale, les mises à jour et les fonctionnalités nécessitant des appels API externes.",
        faq4Question: 'La licence est-elle un paiement unique ?',
        faq4Answer:
            "Oui. Vous payez une fois et obtenez un accès à vie à ClawHost Go, y compris toutes les futures mises à jour. Pas d'abonnement, pas de frais récurrents.",
        faq5Question: "Quels systèmes d'exploitation sont pris en charge ?",
        faq5Answer:
            'ClawHost Go prend en charge Windows et macOS. Les deux plateformes bénéficient des mêmes fonctionnalités et reçoivent les mises à jour simultanément.',
        faq6Question: 'Puis-je passer de Go à Cloud plus tard ?',
        faq6Answer:
            'Absolument. Vous pouvez exporter votre configuration OpenClaw depuis Go et la déployer sur ClawHost Cloud à tout moment. Les deux plateformes sont entièrement compatibles.',
        statsPrice: '{{price}} $',
        statsLifetime: 'À vie',
        statsOneTime: 'Unique',
        statsPayment: 'Paiement',
        statsLocal: 'Local',
        statsLocally: 'Fonctionne localement',
        statsZero: 'Zéro',
        statsZeroConfig: 'Zéro config',
        ctaTitle: 'Exécutez OpenClaw localement',
        ctaDescription:
            "Paiement unique, licence à vie. Déployez OpenClaw sur votre propre machine — pas de cloud, pas d'abonnements, pas de limites. Vos données, vos règles.",
        ctaButton: 'Obtenir ClawHost Go',
        joinWaitlist: "Rejoindre la liste d'attente",
        joinedWaitlist: "Inscrit à la liste d'attente",
        waitlistJoinedToast: "Vous avez rejoint la liste d'attente.",
        waitlistAlreadyJoinedToast: 'Cet email est déjà sur la liste.',
        waitlistFailedToast: "Impossible de rejoindre la liste d'attente !",
        waitlistEmailPlaceholder: 'Entrez votre email',
        updateAvailable: 'La version {{version}} est disponible.',
        updateDownload: 'Télécharger',
        updateDismiss: 'Plus tard',
        clawNotFound: 'Claw introuvable !',
        invalidClawName:
            'Nom de claw invalide. Utilisez uniquement des lettres, des chiffres et des tirets !',
        clawNameAlreadyExists: 'Un claw avec ce nom existe déjà !',
        invalidSubdomain:
            'Sous-domaine invalide. Utilisez 3 à 20 lettres minuscules et chiffres !',
        subdomainAlreadyInUse: 'Ce sous-domaine est déjà utilisé !',
        clawDirectoryNotFound: 'Répertoire du claw introuvable !',
        noVersionInstalled:
            "Aucune version d'OpenClaw installée. Allez dans l'onglet Versions et installez-en une d'abord !",
        failedToStartClaw: 'Échec du démarrage du claw !',
        noVersionAssigned: "Aucune version d'OpenClaw assignée à ce claw !",
        invalidAgentName: "Nom d'agent invalide !",
        agentNameAlreadyExists: 'Un agent avec ce nom existe déjà !',
        invalidPath: 'Chemin invalide !',
        fileNotFound: 'Fichier introuvable !',
        purchasingNotAvailable: "L'achat n'est pas disponible en mode local !",
        exportFailed: "Échec de l'export !",
        versionNotInstalled:
            "La version {{version}} d'OpenClaw n'est pas installée !",
        failedToStartProcess: 'Échec du démarrage du processus : {{reason}} !',
        processExitedImmediately:
            "Le processus s'est terminé immédiatement. Logs :\n{{logs}}",
        processExitedImmediatelyNoLogs:
            "Le processus s'est terminé immédiatement après le démarrage !",
        processExitedWithCode:
            "Le processus s'est terminé avec le code {{code}}. Logs :\n{{logs}}",
        processExitedWithCodeNoLogs:
            "Le processus s'est terminé avec le code {{code}} !",
        processExitedUnexpectedly:
            "Le processus s'est terminé de manière inattendue !",
        failedToInstallVersion:
            "Échec de l'installation d'OpenClaw {{version}} : {{reason}} !",
        oauthCancelled: 'Authentification annulée !',
        diskFull: "Plus d'espace disponible sur le disque !",
        permissionDenied: 'Permission refusée !',
        networkTimeout: 'La requête réseau a expiré !'
    },
    footer: {
        website: 'Site web',
        copyrightName: 'ClawHost',
        copyrightRights: 'Tous droits réservés.',
        termsOfService: "Conditions d\'utilisation",
        privacyPolicy: 'Politique de confidentialité',
        getInTouch: 'Nous contacter',
        brandDescription:
            'Déployez OpenClaw sur votre propre VPS en un clic. Confidentialité totale, ressources dédiées, aucune infrastructure partagée.',
        builtBy: 'Créé par',
        supportedBy: 'Soutenu par',
        product: 'Produit',
        howItWorks: 'Processus',
        features: 'Fonctions',
        pricing: 'Tarifs',
        faq: 'Questions',
        blog: 'Blog',
        changelog: 'Journal des modifications',
        compare: 'Comparaison complète',
        legalAndMore: 'Autres',
        documentation: 'Documentation',
        productDescription:
            'Déployez vos agents OpenClaw dans le cloud ou en local en un clic — créez, connectez et faites évoluer vos agents IA plus vite avec ClawHost.',
        downloadAndroid: 'Télécharger sur Google Play',
        downloadIos: "Télécharger sur l\'App Store",
        ariaGithub: 'GitHub',
        ariaX: 'X',
        ariaFacebook: 'Facebook',
        ariaInstagram: 'Instagram',
        ariaThreads: 'Threads',
        ariaYoutube: 'YouTube',
        ariaTiktok: 'TikTok'
    },
    errors: {
        somethingWentWrong: 'Une erreur est survenue !',
        couldNotLoadData:
            'Impossible de charger les données. Veuillez réessayer !',
        notFound: 'Page introuvable !',
        pageNotFoundDescription:
            "La page que vous recherchez n\'existe pas ou a été déplacée.",
        goToHomepage: "Aller à l\'accueil",
        failedToLoadClaws: 'Échec du chargement des claws !',
        failedToLoadClawsDescription:
            'Impossible de charger vos Claws. Veuillez vérifier votre connexion et réessayer !',
        failedToLoadSSHKeys: 'Échec du chargement des clés SSH !',
        failedToLoadSSHKeysDescription:
            'Impossible de charger vos clés SSH. Veuillez vérifier votre connexion et réessayer !',
        failedToUpdateProfile: 'Échec de la mise à jour du profil !',
        failedToAddSSHKey: "Échec de l\'ajout de la clé SSH !",
        failedToCreateClaw: 'Échec de la création du claw !',
        failedToLoadLocations:
            'Échec du chargement des emplacements. Veuillez réessayer !',
        failedToLoadPlans:
            'Échec du chargement des offres. Veuillez réessayer !',
        invalidPlan: 'Offre sélectionnée invalide !',
        invalidLocation: 'Veuillez sélectionner un emplacement !',
        failedToGenerateKeyPair:
            'Échec de la génération de la paire de clés. Veuillez générer les clés localement !',
        unableToLoadPricing:
            'Impossible de charger les tarifs. Veuillez réessayer plus tard !',
        noPasswordAvailable: 'Aucun mot de passe disponible pour ce claw !',
        clawLimitReached:
            'Vous avez atteint la limite de {{max}} claws. Veuillez contacter le support pour augmenter cette limite !',
        sshKeyLimitReached:
            'Vous avez atteint la limite de {{max}} clés SSH. Veuillez contacter le support pour augmenter cette limite !'
    },
    api: {
        missingRequiredFields: 'Champs obligatoires manquants !',
        clawNotFound: 'Claw introuvable !',
        clawRenamed: 'Claw renommé avec succès.',
        invalidClawName:
            'Le nom du claw doit contenir entre 1 et {{max}} caractères !',
        userNotFound: 'Utilisateur introuvable !',
        sshKeyNotFound: 'Clé SSH introuvable !',
        pendingClawNotFound: 'Claw en attente introuvable !',
        clawNotScheduledForDeletion:
            "Ce claw n\'est pas programmé pour la suppression !",
        clawLimitReached:
            'Vous avez atteint la limite de {{max}} claws. Veuillez contacter le support pour augmenter cette limite !',
        sshKeyLimitReached:
            'Vous avez atteint la limite de {{max}} clés SSH. Veuillez contacter le support pour augmenter cette limite !',
        volumeSizeInvalid:
            'La taille du volume doit être comprise entre {{min}} et {{max}} Go !',
        paymentNotConfigured:
            "Le paiement n\'est pas configuré pour cette offre !",
        invalidSshKeyFormat: 'Format de clé publique SSH invalide !',
        sshKeyInUse:
            'Cette clé SSH est actuellement utilisée par un ou plusieurs claws !',
        inputTooLong: 'La saisie dépasse la longueur maximale autorisée !',
        invalidEnvVars:
            "Noms ou valeurs de variables d\'environnement invalides !",
        invalidEmailFormat: "Format d\'email invalide !",
        plusAddressingNotAllowed:
            "L\'adressage avec le signe + n\'est pas autorisé pour la connexion par email !",
        invalidRedirectUrl: 'URL de redirection invalide !',
        fileTooLarge:
            'Le contenu du fichier dépasse la taille maximale autorisée !',
        nameAndKeyRequired: 'Le nom et la clé publique sont requis !',
        nameTooLong: 'Le nom doit contenir {{max}} caractères ou moins !',
        noBillingAccount: 'Aucun compte de facturation trouvé !',
        orderIdRequired: "L\'identifiant de commande est requis !",
        orderNotFound: 'Commande introuvable !',
        emailRequired: "L\'email est requis !",
        redirectUrlRequired: "L\'URL de redirection est requise !",
        invalidWebhook: 'Webhook invalide !',
        failedToStartClaw: 'Échec du démarrage du claw !',
        failedToStopClaw: "Échec de l\'arrêt du claw !",
        failedToRestartClaw: 'Échec du redémarrage du claw !',
        failedToDeleteClaw: 'Échec de la suppression du claw !',
        failedToCreateClaw: 'Échec de la création du claw !',
        invalidProvider: 'Fournisseur invalide !',
        providerNotAllowed:
            "Ce fournisseur n\'est pas disponible actuellement !",
        invalidPlan: 'Offre sélectionnée invalide !',
        planBelowMinimumMemory:
            'Cette offre ne satisfait pas la mémoire minimale requise !',
        invalidLocation: 'Emplacement sélectionné invalide !',
        planNotAvailableAtLocation:
            "Ce plan n'est pas disponible à l'emplacement sélectionné !",
        failedToSyncClaw: 'Échec de la synchronisation du statut du serveur !',
        failedToProvisionClaw: 'Échec du provisionnement du claw !',
        failedToInitiatePurchase: "Échec de l\'initiation de l\'achat !",
        failedToCancelDeletion: "Échec de l\'annulation de la suppression !",
        failedToHardDeleteClaw: 'Échec de la suppression définitive du claw !',
        failedToCancelScheduledDeletion:
            "Échec de l\'annulation de la suppression programmée !",
        failedToCreateSshKey: 'Échec de la création de la clé SSH !',
        failedToDeleteSshKey: 'Échec de la suppression de la clé SSH !',
        failedToUpdateProfile: 'Échec de la mise à jour du profil !',
        failedToGetProfile: 'Échec de la récupération du profil !',
        failedToGetInvoice: 'Échec de la récupération de la facture !',
        failedToGetCustomerPortal:
            'Échec de la récupération du portail client !',
        failedToGetBillingHistory:
            "Échec de la récupération de l\'historique de facturation !",
        failedToGetStats: 'Échec de la récupération des statistiques !',
        affiliateFetched: 'Informations d\'affiliation récupérées avec succès.',
        failedToGetAffiliate: 'Échec de la récupération des informations d\'affiliation !',
        referralCodeUpdated: 'Code de parrainage mis à jour avec succès.',
        failedToUpdateReferralCode: 'Échec de la mise à jour du code de parrainage !',
        invalidReferralCodeLength: 'Le code de parrainage doit contenir entre {{min}} et {{max}} caractères !',
        invalidReferralCodeFormat: 'Le code de parrainage ne peut contenir que des lettres, chiffres, tirets et underscores !',
        referralCodeAlreadyChanged: 'Le code de parrainage ne peut être modifié qu\'une seule fois !',
        referralCodeTaken: 'Ce code de parrainage est déjà pris !',
        referralCodeGenerated: 'Code de parrainage généré.',
        failedToGenerateReferralCode: 'Échec de la génération du code de parrainage !',
        failedToFetchLocations: 'Échec de la récupération des emplacements !',
        failedToFetchPlans: 'Échec de la récupération des offres !',
        failedToFetchVolumePricing:
            'Échec de la récupération des tarifs de volume !',
        failedToFetchPlanAvailability:
            'Échec de la récupération de la disponibilité des offres !',
        failedToSendEmail: "Échec de l\'envoi de l\'email !",
        failedToGetVersion: 'Échec de la récupération de la version !',
        failedToGetVersions: 'Impossible de récupérer les versions !',
        failedToInstallVersion: "Impossible d\'installer la version !",
        installVersionSuccess: 'Version installée avec succès.',
        invalidVersion: 'Format de version invalide !',
        outdatedVersion:
            'Cette version est obsolète et ne peut pas être installée !',
        failedToGetDiagnostics: "Échec de la connexion à l\'instance !",
        failedToGetDiagnosticsDescription:
            "Impossible de récupérer les diagnostics. L\'instance est peut-être hors ligne ou en cours de démarrage !",
        failedToGetLogs: 'Échec du chargement des journaux !',
        failedToGetLogsDescription:
            'Impossible de récupérer les journaux pour cette instance. Veuillez réessayer plus tard !',
        failedToRepairClaw: "Échec de la réparation de l\'instance !",
        repairSuccess: 'Instance réparée avec succès.',
        repairGatewayNotResponding:
            'Réparation appliquée mais la passerelle ne répond pas encore. Elle peut avoir besoin de plus de temps pour démarrer !',
        failedToReinstallClaw: "Échec de la réinstallation de l\'instance !",
        reinstallSuccess: 'Instance réinstallée avec succès.',
        reinstallRateLimited:
            "Vous ne pouvez réinstaller qu\'une fois toutes les 24 heures. Veuillez contacter l\'équipe si vous souhaitez supprimer cette limite.",
        clawBusy: 'Le claw est en cours de provisionnement ou de suppression !',
        reinstallGatewayNotResponding:
            'Réinstallation terminée mais la passerelle ne répond pas encore. Elle peut avoir besoin de plus de temps pour démarrer !',
        failedToExportClaw: "Échec de l\'exportation des données du claw !",
        clawNotReady: "Le claw n\'est pas prêt pour l\'exportation !",
        exportRateLimited:
            'Ce claw a été exporté récemment. Veuillez patienter avant de réexporter !',
        failedToListFiles: "Échec de la liste des fichiers de l\'instance !",
        failedToReadFile: 'Échec de la lecture du fichier !',
        failedToUpdateFile: "Échec de l\'enregistrement du fichier !",
        invalidFilePath: 'Chemin de fichier invalide !',
        fileNotEditable: 'Ce type de fichier ne peut pas être modifié !',
        invalidJsonConfig: 'JSON invalide !',
        fileSaveSuccess: 'Fichier enregistré.',
        rateLimitExceeded:
            'Veuillez patienter avant de demander un nouveau code !',
        otpExpiredOrNotFound:
            'Code expiré ou introuvable. Veuillez en demander un nouveau !',
        otpMaxAttemptsReached:
            'Trop de tentatives échouées. Veuillez demander un nouveau code !',
        otpInvalidCode: 'Code invalide. Veuillez réessayer !',
        licenseAlreadyPurchased: 'Licence déjà achetée !',
        licenseNotAvailable: "Le produit de licence n\'est pas disponible !",
        licenseCheckoutCreated: 'Paiement de licence créé.',
        failedToPurchaseLicense:
            'Échec de la création du paiement de licence !',
        internalServerError: 'Une erreur interne est survenue !',
        invalidCredentials: 'Identifiants invalides !',
        accountLinked: 'Compte lié avec succès.',
        webhookProcessingFailed: 'Échec du traitement du webhook !',
        adminAccessDenied: 'Accès administrateur requis !',
        clawsFetched: 'Claws récupérés avec succès.',
        clawFetched: 'Claw récupéré avec succès.',
        clawSynced: 'Claw synchronisé avec succès.',
        clawStarted: 'Claw démarré avec succès.',
        clawStopped: 'Claw arrêté avec succès.',
        clawRestarted: 'Claw redémarré avec succès.',
        clawCreated: 'Claw créé avec succès.',
        clawDeleted: 'Claw supprimé avec succès.',
        clawDeletionScheduled: 'Suppression du claw programmée.',
        clawDeletionCancelled: 'Suppression du claw annulée.',
        clawHardDeleted: 'Claw supprimé définitivement.',
        pendingClawCancelled: 'Achat annulé.',
        failedToCancelPendingClaw: "Échec de l\'annulation de l\'achat !",
        clawPurchaseInitiated: 'Achat initié avec succès.',
        sshKeysFetched: 'Clés SSH récupérées avec succès.',
        sshKeyCreated: 'Clé SSH créée avec succès.',
        sshKeyDeleted: 'Clé SSH supprimée avec succès.',
        profileFetched: 'Profil récupéré avec succès.',
        profileUpdated: 'Profil mis à jour avec succès.',
        statsFetched: 'Statistiques récupérées avec succès.',
        billingHistoryFetched:
            'Historique de facturation récupéré avec succès.',
        invoiceFetched: 'Facture récupérée avec succès.',
        customerPortalFetched: 'URL du portail client récupérée avec succès.',
        plansFetched: 'Offres récupérées avec succès.',
        locationsFetched: 'Emplacements récupérés avec succès.',
        volumePricingFetched: 'Tarifs de volume récupérés avec succès.',
        planAvailabilityFetched:
            'Disponibilité des offres récupérée avec succès.',
        agentsFetched: 'Agents récupérés avec succès.',
        agentsFetchFailed:
            "Impossible de joindre l\'instance pour récupérer les agents !",
        agentConfigFetched: "Configuration de l\'agent récupérée avec succès.",
        agentConfigUpdated:
            "Configuration de l\'agent mise à jour avec succès.",
        agentConfigUpdateFailed:
            "Impossible de mettre à jour la configuration de l\'agent !",
        agentCreated: 'Agent créé avec succès.',
        agentCreateFailed: "Impossible de créer l\'agent sur l\'instance !",
        agentDeleted: 'Agent supprimé avec succès.',
        agentDeleteFailed: "Impossible de supprimer l\'agent de l\'instance !",
        cannotDeleteMainAgent:
            'Impossible de supprimer le dernier agent restant !',
        agentNameInvalid:
            "Le nom de l\'agent ne doit contenir que des lettres, des chiffres et des tirets !",
        agentNameDuplicate: 'Un agent avec ce nom existe déjà !',
        diagnosticsFetched: 'Diagnostics récupérés avec succès.',
        logsFetched: 'Journaux récupérés avec succès.',
        filesFetched: 'Fichiers récupérés avec succès.',
        fileFetched: 'Fichier récupéré avec succès.',
        otpSent: 'Code envoyé avec succès.',
        otpVerified: 'Code vérifié avec succès.',
        webhookReceived: 'Webhook reçu.',
        unauthorized: 'Non autorisé !',
        invalidToken: 'Jeton invalide !',
        notFound: 'Introuvable !',
        healthOk: "L\'API fonctionne.",
        channelsFetched: 'Canaux récupérés avec succès.',
        channelsUpdated: 'Canaux mis à jour avec succès.',
        channelsUpdateFailed: 'Impossible de mettre à jour les canaux !',
        channelsFetchFailed: 'Impossible de récupérer les canaux !',
        channelMissingRequired:
            'Champs obligatoires manquants pour le canal activé !',
        whatsappPairStarted: 'Couplage WhatsApp démarré.',
        whatsappPairFailed: 'Échec du couplage WhatsApp !',
        whatsappAlreadyPaired: 'WhatsApp est déjà couplé !',
        whatsappVersionUnsupported:
            "Cette version ne prend pas en charge la configuration des canaux depuis le tableau de bord. Utilisez l'onglet Terminal pour configurer manuellement ou mettez à jour OpenClaw.",
        featureVersionUnsupported: 'Cette fonctionnalité n\'est pas prise en charge sur la version {{version}}. Veuillez mettre à jour OpenClaw ou utiliser le Terminal pour gérer cela manuellement.',
        bindingsFetched: 'Liaisons récupérées avec succès.',
        bindingsFetchFailed: 'Impossible de récupérer les liaisons !',
        bindingsUpdated: 'Liaisons mises à jour avec succès.',
        bindingsUpdateFailed: 'Impossible de mettre à jour les liaisons !',
        bindingsInvalidFormat: 'Format de liaison invalide !',
        bindingsInvalidChannel: 'Canal non pris en charge dans la liaison !',
        bindingsDuplicateChannel:
            "Un canal ne peut être lié qu\'à un seul agent !",
        skillsFetched: 'Compétences récupérées avec succès.',
        skillsUpdated: 'Compétences mises à jour avec succès.',
        skillsUpdateFailed: 'Impossible de mettre à jour les compétences !',
        skillsFetchFailed: 'Impossible de récupérer les compétences !',
        agentSkillsFetched: "Compétences de l\'agent récupérées avec succès.",
        agentSkillsUpdated: "Compétences de l\'agent mises à jour avec succès.",
        agentSkillsUpdateFailed:
            "Impossible de mettre à jour les compétences de l\'agent !",
        agentSkillsFetchFailed:
            "Impossible de récupérer les compétences de l\'agent !",
        invalidSkillName:
            'Le nom de la compétence ne doit contenir que des lettres, des chiffres, des tirets et des underscores !',
        skillNotFound: 'Compétence introuvable !',
        clawHubSearchSuccess: 'Recherche ClawHub terminée.',
        clawHubSearchFailed: 'Impossible de rechercher sur ClawHub !',
        clawHubFetched: 'Compétences ClawHub récupérées.',
        clawHubFetchFailed: 'Impossible de récupérer les compétences ClawHub !',
        clawHubInstalled: 'Compétence installée depuis ClawHub.',
        clawHubInstallFailed:
            "Impossible d\'installer la compétence depuis ClawHub !",
        clawHubRemoved: 'Compétence ClawHub supprimée.',
        clawHubRemoveFailed: 'Impossible de supprimer la compétence ClawHub !',
        clawHubUpdated: 'Compétence mise à jour.',
        clawHubUpdateFailed:
            'Impossible de mettre à jour la compétence ClawHub !',
        clawHubUpdatesFetched: 'Vérification des mises à jour terminée.',
        clawHubUpdatesFailed: 'Impossible de vérifier les mises à jour !',
        invalidAuthMethod: "Méthode d\'authentification invalide !",
        authMethodNotConnected:
            "Cette méthode d\'authentification n\'est pas connectée !",
        authMethodConnected:
            "Méthode d\'authentification connectée avec succès.",
        authMethodDisconnected:
            "Méthode d\'authentification déconnectée avec succès.",
        failedToConnectAuthMethod:
            "Échec de la connexion de la méthode d\'authentification !",
        failedToDisconnectAuthMethod:
            "Échec de la déconnexion de la méthode d\'authentification !",
        textRequired: 'Le texte est requis !',
        voiceNotFound: 'Modèle vocal introuvable !',
        ttsGenerationFailed: 'Échec de la génération vocale !',
        voicesFetched: 'Voix récupérées avec succès.',
        featureEmailsSent: 'Emails de fonctionnalités envoyés avec succès.',
        featureEmailsFailed: "Échec de l'envoi des emails de fonctionnalités !",
        invalidFeatureKey: 'Clé de fonctionnalité invalide !',
        waitlistJoined: "Inscription à la liste d'attente réussie.",
        waitlistAlreadyJoined: "Déjà inscrit à la liste d'attente.",
        waitlistJoinFailed: "Échec de l'inscription à la liste d'attente !",
        waitlistRateLimited:
            'Vous allez trop vite ! Veuillez réessayer dans {{seconds}} {{unit}}.',
        waitlistStatusFetched: "Statut de la liste d'attente récupéré.",
        waitlistCheckFailed:
            "Échec de la vérification du statut de la liste d'attente !"
    },
    emails: {
        otpSubject: 'Votre code de connexion ClawHost',
        otpPreview: 'Votre code de connexion ClawHost : {{code}}',
        otpHeading: 'Votre code de connexion est :',
        otpExpiry:
            "Le code expire dans 10 minutes. Si ce n\'était pas vous, ignorez cet email.",
        changelogSubject: 'Les nouveautés de ClawHost',
        changelogPreview:
            'Découvrez les dernières mises à jour de ClawHost : {{title}}',
        changelogHeading: 'Nouveautés',
        changelogButton: 'Voir le changelog',
        changelogVisitButton: 'Visiter ClawHost',
        changelogFooter:
            'Vous recevez cet email car vous avez un compte ClawHost.',
        featureFooter:
            'Vous recevez cet email car vous avez un compte ClawHost.',
        features: {
            terminal: {
                subject: 'Le saviez-vous ? Vous avez un terminal web',
                preview:
                    'Accédez à votre serveur directement depuis le navigateur',
                heading: 'Votre serveur est à un clic',
                description:
                    'Accédez à votre serveur directement depuis votre navigateur avec notre terminal intégré. Pas besoin de client SSH — ouvrez ClawHost et commencez à taper vos commandes.',
                cta: 'Ouvrir le terminal'
            },
            logs: {
                subject:
                    'Le saviez-vous ? Des logs en temps réel dans votre tableau de bord',
                preview:
                    'Surveillez les logs de votre serveur sans quitter le navigateur',
                heading: 'Voyez ce que fait votre serveur',
                description:
                    'Surveillez les logs de votre serveur en temps réel depuis le tableau de bord ClawHost. Diagnostiquez les problèmes, suivez les déploiements et déboguez vos applications sans quitter le navigateur.',
                cta: 'Voir les logs'
            },
            channels: {
                subject:
                    'Le saviez-vous ? Connectez vos agents à Discord, Slack et plus',
                preview: 'Liez vos agents IA à vos canaux de communication',
                heading: 'Vos agents, partout',
                description:
                    'Connectez vos agents IA à Discord, Slack, WhatsApp et plus encore. Configurez les canaux et liez-les à vos agents — le tout depuis le tableau de bord ClawHost.',
                cta: 'Configurer les canaux'
            },
            fileExplorer: {
                subject:
                    'Le saviez-vous ? Modifiez vos fichiers depuis le navigateur',
                preview: 'Parcourez, lisez et éditez vos fichiers sans SSH',
                heading: 'Vos fichiers, à portée de main',
                description:
                    'Parcourez, lisez et éditez les fichiers de votre serveur directement depuis le tableau de bord ClawHost. Coloration syntaxique, recherche et sauvegarde instantanée — sans SSH.',
                cta: "Ouvrir l'explorateur"
            },
            playground: {
                subject: 'Le saviez-vous ? Visualisez votre infrastructure',
                preview: 'Voyez vos claws et agents sur un canvas interactif',
                heading: "Voyez l'ensemble",
                description:
                    "Le Playground vous offre un canvas interactif montrant tous vos claws et agents. Cliquez sur n'importe quel nœud pour le gérer — un centre de commande visuel pour votre infrastructure.",
                cta: 'Ouvrir le Playground'
            },
            agentChat: {
                subject: 'Le saviez-vous ? Chattez avec vos agents IA',
                preview:
                    'Parlez à vos agents directement depuis le tableau de bord',
                heading: 'Parlez à vos agents',
                description:
                    "Chattez avec vos agents IA directement depuis le tableau de bord ClawHost. Envoyez des messages, joignez des images et consultez l'historique — tout en un seul endroit.",
                cta: 'Commencer à chatter'
            },
            voiceMode: {
                subject: 'Le saviez-vous ? Parlez à vos agents par la voix',
                preview: 'Utilisez la reconnaissance vocale avec vos agents',
                heading: 'Parlez, ne tapez pas',
                description:
                    'Utilisez le mode vocal pour parler à vos agents IA en mains libres. Reconnaissance vocale en entrée, synthèse vocale en sortie — avec plusieurs voix au choix.',
                cta: 'Essayer le mode vocal'
            },
            skills: {
                subject: 'Le saviez-vous ? Plus de 5 000 skills sur ClawHub',
                preview:
                    'Parcourez et installez des skills communautaires en un clic',
                heading: 'Étendez vos agents instantanément',
                description:
                    "Parcourez plus de 5 000 skills prêts à l'emploi sur ClawHub et installez-les en un seul clic. Recherche web, exécution de code, génération d'images et bien plus.",
                cta: 'Parcourir ClawHub'
            },
            bindings: {
                subject:
                    'Le saviez-vous ? Liez des agents à des canaux spécifiques',
                preview: 'Contrôlez quel agent répond sur quel canal',
                heading: 'Un agent par canal',
                description:
                    'Liez des agents spécifiques à des canaux spécifiques. Votre agent support sur Discord, votre assistant sur WhatsApp — vous décidez qui répond où.',
                cta: 'Configurer les liaisons'
            },
            envVars: {
                subject: "Le saviez-vous ? Gérez les variables d'environnement",
                preview: 'Configurez les clés API et la config sans SSH',
                heading: 'Configurez sans SSH',
                description:
                    "Ajoutez, modifiez et supprimez des variables d'environnement directement depuis le tableau de bord ClawHost. Clés API, secrets et configuration — sans terminal.",
                cta: 'Gérer les variables'
            },
            diagnostics: {
                subject: 'Le saviez-vous ? Diagnostics intégrés',
                preview:
                    'Surveillez la santé de votre serveur depuis le tableau de bord',
                heading: 'Vérifiez la santé de votre serveur',
                description:
                    "Lancez des diagnostics sur votre claw pour vérifier l'état des services, l'utilisation mémoire et la disponibilité des ports. Détectez les problèmes avant qu'ils ne s'aggravent.",
                cta: 'Lancer les diagnostics'
            },
            sshKeys: {
                subject: 'Le saviez-vous ? Gérez les clés SSH depuis ClawHost',
                preview:
                    'Générez et gérez vos paires de clés SSH dans le tableau de bord',
                heading: 'Clés SSH, simplifiées',
                description:
                    'Générez des paires de clés SSH, copiez les clés publiques et téléchargez les clés privées — le tout depuis le tableau de bord ClawHost. Assignez des clés à vos claws pour un accès sécurisé.',
                cta: 'Gérer les clés SSH'
            },
            exportConfig: {
                subject:
                    'Le saviez-vous ? Exportez la configuration de votre claw',
                preview: 'Téléchargez votre configuration en fichier portable',
                heading: 'Emportez votre config',
                description:
                    'Exportez la configuration et les paramètres de votre claw sous forme de fichier téléchargeable. Sauvegardez votre setup ou utilisez-le pour répliquer votre environnement.',
                cta: 'Exporter la config'
            },
            multiLanguage: {
                subject: 'Le saviez-vous ? ClawHost parle votre langue',
                preview: 'Utilisez ClawHost dans 14 langues',
                heading: 'ClawHost dans votre langue',
                description:
                    "Passez l'intégralité du tableau de bord ClawHost dans l'une des 14 langues disponibles. Des boutons aux messages d'erreur — tout est traduit.",
                cta: 'Changer la langue'
            },
            subdomain: {
                subject:
                    'Le saviez-vous ? Chaque claw a son propre sous-domaine',
                preview:
                    'Accédez à votre claw depuis partout avec une URL personnalisée',
                heading: 'Accédez depuis partout',
                description:
                    "Chaque claw reçoit un sous-domaine unique pour accéder à votre instance OpenClaw depuis n'importe où. Pas de redirection de port, pas de réseau local — juste une URL.",
                cta: 'Voir votre sous-domaine'
            },
            darkMode: {
                subject: 'Le saviez-vous ? ClawHost a un mode sombre',
                preview: 'Basculez entre les thèmes clair et sombre',
                heading: 'Doux pour les yeux',
                description:
                    'Basculez entre les thèmes clair et sombre dans le tableau de bord ClawHost. Votre préférence est sauvegardée et appliquée automatiquement à chaque visite.',
                cta: 'Essayer le mode sombre'
            },
            reinstall: {
                subject: 'Le saviez-vous ? Réinstallez OpenClaw en un clic',
                preview:
                    'Réinitialisez votre instance OpenClaw sans perdre votre serveur',
                heading: 'Nouveau départ, même serveur',
                description:
                    'Réinstallez le runtime OpenClaw sur votre serveur existant en un seul clic. Votre serveur reste intact — seul OpenClaw reçoit une installation propre.',
                cta: 'En savoir plus'
            },
            yearlyPlans: {
                subject: 'Le saviez-vous ? Économisez avec les plans annuels',
                preview: 'Passez à la facturation annuelle et payez moins',
                heading: 'Payez moins, obtenez plus',
                description:
                    'Passez à la facturation annuelle et économisez sur votre abonnement claw. Le même excellent service, à un prix réduit — annulez à tout moment.',
                cta: 'Voir les plans'
            }
        }
    },
    auth: {
        signIn: 'Se connecter',
        signInDescription:
            'Connectez-vous à votre compte ClawHost pour gérer vos instances OpenClaw.',
        signingIn: 'Connexion en cours...',
        verifyCode: 'Vérifier le code',
        checkYourEmail: 'Vérifiez votre email',
        checkYourEmailHeading: 'Vérifiez votre email',
        codeSentTo: 'Nous avons envoyé un code à 6 chiffres à',
        signInToDeployOpenClaw:
            'Connectez-vous pour gérer et déployer des instances OpenClaw.',
        emailAddress: 'Adresse email',
        emailPlaceholder: 'exemple@clawhost.cloud',
        continueWithEmail: "Continuer avec l\'email",
        otpDescription:
            'Nous vous enverrons un code pour vous connecter. Aucun mot de passe nécessaire.',
        welcomeBack: 'Bon retour.',
        resendIn: 'Renvoyer dans {{seconds}}s',
        resendCode: 'Renvoyer le code',
        changeEmail: "Changer d\'email",
        invalidCode: 'Code invalide !',
        invalidEmailFormat: 'Veuillez entrer une adresse email valide !',
        plusAddressingNotAllowed:
            "L\'adressage avec le signe + n\'est pas autorisé pour la connexion par email !",
        or: 'ou',
        continueWithGoogle: 'Continuer avec Google',
        continueWithGithub: 'Continuer avec GitHub',
        agreementNotice: 'En continuant, vous acceptez nos',
        termsOfService: "Conditions d\'utilisation",
        andWord: 'et',
        privacyPolicy: 'Politique de confidentialité'
    },
    account: {
        title: 'Compte',
        description:
            'Gérez les paramètres de votre compte ClawHost et vos informations de profil.',
        accountSettings: 'Compte',
        manageYourAccount:
            'Gérez votre profil et les paramètres de votre compte.',
        profileInformation: 'Informations du profil',
        profileDescription:
            "Vos informations personnelles et votre nom d\'affichage.",
        noNameSet: 'Aucun nom défini',
        joined: 'Inscrit le',
        claws: 'claws',
        sshKeys: 'clés',
        displayName: "Nom d\'affichage",
        enterYourName: 'Entrez votre nom',
        emailAddress: 'Adresse email',
        emailNotEditable:
            "L\'email n\'est pas modifiable. Contactez le support.",
        profileUpdatedSuccessfully: 'Profil mis à jour avec succès.',
        billingHistory: 'Historique de facturation',
        billingDescription: 'Votre historique de paiements et factures',
        date: 'Date',
        product: 'Produit',
        amount: 'Montant',
        status: 'Statut',
        statusPaid: 'Payé',
        statusPending: 'En attente',
        statusRefunded: 'Remboursé',
        statusPartiallyRefunded: 'Partiellement remboursé',
        billingReasonPurchase: 'Achat',
        billingReasonSubscriptionCreate: 'Nouvel abonnement',
        billingReasonSubscriptionCycle: 'Renouvellement',
        billingReasonSubscriptionUpdate: "Mise à jour d\'abonnement",
        noBillingHistory: 'Aucune facturation',
        noBillingHistoryDescription:
            "Vous n\'avez aucun historique de paiement. Une fois votre premier claw déployé, vos facturations apparaîtront ici.",
        failedToLoadBilling:
            "Échec du chargement de l\'historique de facturation !",
        viewInvoice: 'Voir la facture',
        failedToLoadInvoice: 'Échec du chargement de la facture !',
        couponApplied: 'Coupon : {{name}}',
        manageBilling: 'Gérer la facturation',
        failedToLoadPortal: "Échec de l\'ouverture du portail de facturation !",
        connectedAccounts: 'Comptes connectés',
        connectedAccountsDescription:
            'Gérez les méthodes de connexion liées à votre compte.',
        authEmail: 'Email',
        authGoogle: 'Google',
        authGithub: 'GitHub',
        authConnected: 'Connecté',
        authConnect: 'Connecter',
        authDisconnect: 'Déconnecter',
        emailCannotBeDisconnected:
            "L\'email est toujours connecté en tant que méthode de connexion principale.",
        providerConnected: '{{provider}} connecté avec succès.',
        providerDisconnected: '{{provider}} déconnecté avec succès.',
        providerEmailMismatch:
            'Vous ne pouvez connecter que des comptes utilisant la même adresse e-mail !',
        settings: 'Paramètres',
        settingsDescription: 'Gérez les préférences de votre tableau de bord.',
        showAllClaws: 'Afficher tous les claws de tous les utilisateurs',
        openLinksWindowed: 'Ouvrir les liens dans une vue fenêtrée',
        openLinksWindowedDescription:
            "Lorsque cette option est activée, les liens externes s\'ouvrent dans l\'application au lieu du navigateur système."
    },
    billing: {
        title: 'Facturation',
        description:
            'Consultez votre historique de paiements et gérez votre facturation.',
        billingHistory: 'Facturation',
        manageYourBilling:
            'Consultez votre historique de paiements et gérez vos factures.',
        billingDescription: 'Votre historique de paiements et factures',
        date: 'Date',
        product: 'Produit',
        amount: 'Montant',
        status: 'Statut',
        statusPaid: 'Payé',
        statusPending: 'En attente',
        statusRefunded: 'Remboursé',
        statusPartiallyRefunded: 'Partiellement remboursé',
        billingReasonPurchase: 'Achat',
        billingReasonSubscriptionCreate: 'Nouvel abonnement',
        billingReasonSubscriptionCycle: 'Renouvellement',
        billingReasonSubscriptionUpdate: "Mise à jour d\'abonnement",
        noBillingHistory: 'Aucune facturation',
        noBillingHistoryDescription:
            "Vous n\'avez aucun historique de paiement. Une fois votre premier claw déployé, vos facturations apparaîtront ici.",
        failedToLoadBilling:
            "Échec du chargement de l\'historique de facturation !",
        failedToLoadBillingDescription:
            'Impossible de charger votre historique de facturation. Veuillez vérifier votre connexion et réessayer !',
        viewInvoice: 'Voir la facture',
        failedToLoadInvoice: 'Échec du chargement de la facture !',
        couponApplied: 'Coupon : {{name}}',
        manageBilling: 'Gérer la facturation',
        failedToLoadPortal: "Échec de l\'ouverture du portail de facturation !"
    },
    license: {
        title: 'Licence',
        description: 'Gérez votre licence OpenClaw.',
        pageTitle: 'Licence',
        pageDescription:
            'Achetez votre licence pour auto-héberger des instances OpenClaw localement avec notre application Go.',
        planName: 'Licence ClawHost Go',
        oneTimePurchase: 'Achat unique',
        price: '{{price}} $',
        priceNote: 'Payez une fois, possédez pour toujours.',
        purchaseLicense: 'Acheter la licence',
        purchasing: 'Redirection...',
        activated: 'Licence active',
        activatedDescription:
            'Votre licence est active. Merci pour votre soutien.',
        paymentSuccess: 'Paiement réussi. Votre licence est maintenant active.',
        failedToPurchase: 'Échec du démarrage du paiement !',
        featureUnlimitedClaws: 'OpenClaws illimités',
        featureUnlimitedAgents: 'Agents illimités',
        featureDevices: 'Appareils illimités',
        featureUpdates: 'Mises à jour à vie',
        featureSupport: 'Support prioritaire',
        featureCloud: 'Toutes les fonctionnalités cloud, localement',
        whatsIncluded: 'Ce qui est inclus',
        permanentNote:
            'Les licences sont permanentes et non révocables. Une fois achetée, elle vous appartient pour toujours.',
        gateTitle: 'Licence requise',
        gateDescription:
            "Vous avez besoin d'une licence ClawHost Go pour déployer et gérer des instances OpenClaw localement."
    },
    network: {
        unstable: 'Connexion instable',
        unstableDescription:
            'Votre connexion internet est instable. Certaines fonctionnalités pourraient ne pas fonctionner correctement.',
        offline: 'Pas de connexion internet',
        offlineDescription:
            'Vous êtes actuellement hors ligne. Les fonctionnalités nécessitant un accès internet seront indisponibles.',
        dismiss: 'Fermer'
    },
    dashboard: {
        title: 'Claws',
        description:
            'Consultez et gérez vos instances OpenClaw déployées. Démarrez, arrêtez, redémarrez et surveillez vos serveurs VPS.',
        claw: 'claw',
        clawsPlural: 'claws',
        clawCountLabel: '{{count}} claws',
        clawCountLabelSingular: '{{count}} claw',
        newClaw: 'Nouveau Claw',
        clawActions: 'Actions du claw',
        noClawsYet: 'Aucun Claw',
        noClawsDescription:
            "Aucun claw déployé n\'a été trouvé. Mais vous pouvez déployer votre premier claw à tout moment à partir de 25$/mois. Lancez-vous avec l\'IA.",
        deleteClaw: 'Supprimer le Claw',
        deleteClawConfirmation: 'Êtes-vous sûr de vouloir supprimer',
        deleteClawWarning:
            "Votre abonnement sera annulé et le serveur sera supprimé à la fin de votre période de facturation actuelle. Vous pouvez continuer à l\'utiliser jusque-là.",
        actionCannotBeUndone: 'Cette action est irréversible.',
        start: 'Démarrer',
        stop: 'Arrêter',
        restart: 'Redémarrer',
        stopClaw: 'Arrêter le Claw',
        stopClawConfirmation:
            "Êtes-vous sûr de vouloir arrêter le serveur ? Cela arrêtera tout ce qui est en cours d\'exécution, y compris OpenClaw, mais vous pouvez redémarrer à tout moment. L\'arrêt ne stoppe pas la facturation — supprimez le serveur pour ne plus être facturé.",
        restartClaw: 'Redémarrer le Claw',
        restartClawConfirmation:
            "Êtes-vous sûr de vouloir redémarrer le serveur ? Cela arrêtera tout ce qui est en cours d\'exécution, y compris OpenClaw.",
        copyPassword: 'Copier le mot de passe',
        copySshWithKey: 'Copier SSH (avec clé)',
        copySshWithPassword: 'Copier SSH (avec mot de passe)',
        connect: 'Copier la commande SSH',
        viewServerCredentials: 'Voir les identifiants du serveur',
        serverCredentials: 'Identifiants du serveur',
        serverCredentialsDescription:
            'Utilisez ces identifiants pour vous connecter à votre serveur via SSH.',
        sshCommand: 'Commande SSH',
        rootPassword: 'Mot de passe root',
        sshCommandCopied: 'Commande SSH copiée.',
        sshCommandWithPasswordCopied: 'Commande SSH avec mot de passe copiée.',
        passwordCopiedToClipboard: 'Mot de passe copié dans le presse-papiers.',
        plan: 'Serveur',
        location: 'Emplacement',
        ip: 'IP',
        domain: 'Domaine',
        ipAddress: 'Adresse IP',
        port: 'Port',
        planCost: 'Forfait',
        serverId: 'ID du serveur',
        created: 'Créé le',
        sshKey: 'Clé SSH',
        storage: 'Stockage',
        provider: 'Fournisseur',
        nextBilling: 'Prochaine facturation',
        lastBilling: 'Dernière facturation',
        version: 'Version',
        gatewayToken: 'Jeton de passerelle',
        gatewayTokenDescription:
            'Utilisez ce jeton pour vous authentifier auprès de votre passerelle',
        scheduledForDeletion: 'Suppression programmée',
        scheduledDeletionShort: 'Suppression le {{date}}',
        deletionDate: 'Ce claw sera supprimé le {{date}}',
        deletionTooltip:
            'Suppression programmée le {{date}}. Pour annuler, utilisez le menu.',
        cancelDeletion: 'Annuler la suppression',
        deletionCancelled: 'Suppression annulée.',
        scheduleDeletion: 'Programmer la suppression',
        resumeCheckout: 'Reprendre le paiement',
        cancelPurchase: "Annuler l\'achat",
        hardDelete: 'Suppression immédiate',
        hardDeleteClaw: 'Suppression immédiate',
        hardDeleteConfirmation:
            'Êtes-vous sûr de vouloir supprimer ce claw immédiatement ? Vous perdrez le temps restant sur votre période de facturation actuelle. Cette action est irréversible.',
        diagnostics: 'Diagnostics',
        diagnosticsDescription:
            "Vérifiez l\'état de santé de votre instance OpenClaw.",
        diagnosticsStatus: 'Statut',
        diagnosticsLogs: 'Journaux',
        diagnosticsRepair: 'Réparer',
        diagnosticsRepairDescription:
            'Supprime les limites de mémoire, applique la dernière configuration de service et redémarre la passerelle. Cela corrige la plupart des problèmes courants.',
        diagnosticsRepairSuccess: 'Instance réparée avec succès.',
        diagnosticsRepairFailed:
            'Réparation appliquée mais la passerelle ne répond pas encore !',
        diagnosticsLoading: "Connexion à l\'instance...",
        diagnosticsNoLogs:
            'Aucun journal disponible. Démarrez votre instance pour générer des journaux.',
        diagnosticsIssueDetected:
            'Un problème a été détecté sur votre instance !',
        diagnosticsHealthy: 'Votre instance fonctionne normalement.',
        diagnosticsPort: 'Port 18789',
        diagnosticsMemory: 'Mémoire',
        logsDescription:
            'Les 100 dernières lignes du journal de votre passerelle, actualisées automatiquement.',
        fileExplorer: 'Explorateur de fichiers',
        fileExplorerRoot: 'openclaw',
        fileExplorerDescription:
            'Parcourez et modifiez vos fichiers de configuration OpenClaw. Des modifications incorrectes peuvent endommager votre instance.',
        fileExplorerSelectFile:
            'Sélectionnez un fichier pour afficher son contenu.',
        fileExplorerReadOnly: 'Lecture seule',
        fileExplorerSave: 'Enregistrer',
        fileExplorerSaved: 'Fichier enregistré.',
        fileExplorerInvalidJson:
            "JSON invalide. Veuillez corriger les erreurs de syntaxe avant d\'enregistrer !",
        fileExplorerNoFiles: 'Aucun fichier trouvé',
        fileExplorerSearchFiles: 'Rechercher des fichiers...',
        fileExplorerNoSearchResults: 'Aucun fichier correspondant.',
        updateInstance: "Mettre à jour l\'instance",
        updateInstanceSuccess: 'Instance mise à jour avec succès.',
        updateInstanceFailed: "Échec de la mise à jour de l\'instance !",
        startFailed: 'Échec du démarrage du claw !',
        renameSuccess: 'Claw renommé avec succès.',
        renameFailed: 'Échec du renommage du claw !',
        renameInvalidChars:
            'Seuls les lettres, chiffres et tirets sont autorisés !',
        reinstallInstance: "Réinstaller l\'instance",
        reinstallClaw: "Réinstaller l\'instance",
        reinstallClawConfirmation:
            'Cela réinstallera complètement OpenClaw sur cette instance. Toutes les configurations, agents et données seront réinitialisés. Cette action est irréversible. Continuer ?',
        reinstallInstanceSuccess: 'Instance réinstallée avec succès.',
        reinstallInstanceFailed: "Échec de la réinstallation de l\'instance !",
        openControlPanel: 'Ouvrir le panneau de contrôle',
        exportData: 'Exporter le Claw (.zip)',
        exportStarted:
            "Préparation de l\'exportation, cela peut prendre un moment...",
        exportSuccess: 'Claw exporté avec succès.',
        exportFailed: "Échec de l\'exportation des données du claw !",
        exportRateLimited:
            'Vous pourrez exporter à nouveau dans {{minutes}} minutes !',
        exportRateLimitedSeconds:
            'Vous pourrez exporter à nouveau dans {{seconds}} secondes !',
        configuringTooltip:
            "Cela peut prendre un certain temps. Cela dépend d\'OpenClaw, de l\'emplacement du serveur et du DNS Cloudflare.",
        paymentSuccess:
            'Votre claw est en cours de création et de configuration.',
        dnsSetupBanner:
            'Configurez le DNS local pour accéder à vos claws via sous-domaine.clawhost.',
        dnsSetupButton: 'Configurer DNS',
        dnsSetupSuccess: 'Résolveur DNS configuré avec succès.',
        dnsSetupError: 'Échec de la configuration du résolveur DNS !',
        chatTab: 'Chat',
        playgroundTab: 'Playground',
        userTab: 'Utilisateur',
        adminTab: 'Admin',
        adminTitle: 'Admin',
        adminDescription: 'Gérez tous les claws de la plateforme.',
        adminNoClaws: 'Aucun claw sur la plateforme pour le moment.',
        adminAccessDenied:
            "Vous n\'avez pas la permission d\'accéder à cette page.",
        owner: 'Propriétaire',
        status: {
            running: 'En cours',
            stopped: 'Arrêté',
            starting: 'Démarrage',
            stopping: 'Arrêt en cours',
            creating: 'Création',
            configuring: 'Configuration',
            initializing: 'Mise en place',
            migrating: 'Migration',
            rebuilding: 'Reconstruction',
            restarting: 'Redémarrage',
            unreachable: 'Injoignable',
            deleting: 'Suppression',
            scheduledDeletion: 'Suppression programmée',
            awaitingPayment: 'En attente de paiement',
            unknown: 'Inconnu',
            checking: 'Vérification'
        }
    },
    chat: {
        explorer: 'Explorateur',
        selectAgent: 'Aucune sélection',
        selectAgentDescription:
            'Sélectionnez un claw ou un agent dans la barre latérale.',
        noAgents: 'Aucun agent disponible',
        noAgentsDescription:
            'Déployez un claw pour commencer à discuter avec les agents',
        openSidebar: 'Ouvrir la barre latérale',
        clawNotReady: "Le claw n\'est pas encore prêt",
        notConfigured: 'Non configuré',
        addAgent: 'Ajouter un agent',
        viewTree: 'Vue arborescente',
        viewList: 'Vue liste',
        clawSettings: 'Paramètres du claw'
    },
    createClaw: {
        title: 'Déployer OpenClaw',
        description:
            "Configurez votre serveur et commencez à construire avec l\'IA.",
        clawName: 'Nom',
        clawNamePlaceholder: 'ex : cozy-panda',
        clawNameInvalidChars:
            'Seuls les lettres, chiffres et tirets sont autorisés !',
        autoGenerateNameHint:
            'Laissez vide pour générer un nom automatiquement.',
        provider: 'Fournisseur',
        providerHetzner: 'Cloud',
        providerLocal: 'Local',
        providerAws: 'AWS',
        comingSoon: 'Bientôt',
        location: 'Emplacement',
        locationUnavailable: 'Indisponible',
        locationUnavailableForPlan: 'Indisponible',
        plan: 'Serveur',
        planUnavailable: 'Indisponible',
        planUnavailableForLocation: 'Non disponible à cet emplacement',
        providerUnavailable: 'Ce fournisseur est actuellement indisponible.',
        providerDisabledHetznerRecommended: 'Indisponible',
        providerAtCapacity:
            "En raison d\'une forte demande, nous sommes temporairement à court de serveurs chez ce fournisseur. Nous travaillons activement à résoudre ce problème.",
        advancedOptions: 'Options avancées facultatives',
        rootPassword: 'Mot de passe root',
        rootPasswordPlaceholder: 'Entrez un mot de passe ou générez-en un',
        gatewayTokenPlaceholder: 'ex. a1b2c3d4e5f6...',
        autoGenerateGatewayTokenHint: 'Optionnel. Pas de jeton si laissé vide.',
        autoGeneratePasswordHint:
            'Optionnel. Pas de mot de passe si laissé vide.',
        regeneratePassword: 'Régénérer le mot de passe',
        sshKeyOptional: 'Clé SSH',
        noSshKeyPasswordOnly: 'Pas de clé SSH (mot de passe uniquement)',
        noSshKeysConfigured: 'Aucune clé SSH configurée',
        addSshKeyForPasswordlessLogin:
            'Ajoutez une clé SSH pour une connexion sans mot de passe',
        additionalStorageOptional: 'Stockage supplémentaire',
        volumeStorage: 'Volume de stockage',
        vpsServer: 'Serveur VPS',
        openClawPreinstalled: 'OpenClaw préinstallé',
        storageWithSize: 'Stockage',
        billingInterval: 'Facturation',
        monthly: 'Mensuel',
        yearly: 'Annuel',
        yearlySaveBadge: '2 mois offerts',
        yearlySavings: 'Vous économisez',
        totalMonthly: 'Total mensuel',
        totalYearly: 'Total annuel',
        creating: 'Création...',
        proceedToPayment: 'Payer {{amount}}$ pour déployer',
        agreementNotice: 'En déployant, vous acceptez nos',
        selectServerToContinue: 'Sélectionnez un serveur pour continuer',
        selectLocationToContinue: 'Sélectionnez un emplacement pour continuer',
        clawCreated: 'Claw créé.',
        assigning: 'Attribution...',
        rootPasswordSaveThis: 'Mot de passe root (conservez-le !)',
        sshCommandUsingKey: 'Commande SSH (avec votre clé)',
        sshCommandWithPassword: 'Commande SSH (avec mot de passe)',
        passwordCopied: 'Mot de passe copié.',
        planSpec: '{{cpu}} vCPU / {{memory}} Go RAM / {{disk}} Go SSD',
        volumeUnit: 'Go',
        volumeMin: '0 Go',
        volumeMax: '500 Go'
    },
    sshKeys: {
        title: 'Clés SSH',
        description:
            'Gérez vos clés SSH pour un accès sécurisé sans mot de passe à vos instances OpenClaw.',
        key: 'clé ssh',
        keys: 'clés ssh',
        addSshKey: 'Ajouter une clé SSH',
        howSshKeysWork: 'Comment connecter une clé SSH ?',
        step1: 'Générez une paire de clés SSH sur votre ordinateur (ou utilisez-en une existante).',
        step2: 'Ajoutez la clé publique ici.',
        step3: "Sélectionnez la clé lors de la création d\'une nouvelle instance.",
        step4: 'Connectez-vous avec',
        step4Command: 'ssh root@your-server-ip',
        step4Suffix: '- aucun mot de passe nécessaire.',
        noSshKeysYet: 'Aucune clé SSH',
        noSshKeysDescription:
            'Aucune clé SSH ajoutée sur votre compte. Vous pouvez en ajouter à tout moment et vous connecter à vos claws déployés.',
        deleteConfirmation:
            'Êtes-vous sûr de vouloir supprimer cette clé SSH ?',
        deleteKey: 'Supprimer la clé SSH',
        deleteKeyConfirmation: 'Êtes-vous sûr de vouloir supprimer',
        sshKeyAddedSuccessfully: 'Clé SSH ajoutée avec succès.',
        addSshKeyModalTitle: 'Ajouter une clé SSH',
        addSshKeyModalDescription:
            'Ajoutez une clé SSH pour une authentification sans mot de passe',
        iHaveAnSshKey: 'Clé existante',
        generateNewKey: 'Créer une nouvelle',
        name: 'Nom',
        namePlaceholder: 'ex : mon-macbook',
        publicKey: 'Clé publique',
        publicKeyPlaceholder: 'ssh-rsa AAAA... ou ssh-ed25519 AAAA...',
        publicKeyHint: 'Trouvez votre clé publique dans',
        publicKeyPath1: '~/.ssh/id_ed25519.pub',
        publicKeyPathOr: 'ou',
        publicKeyPath2: '~/.ssh/id_rsa.pub',
        important: 'Important :',
        dontHaveSshKey: "Vous n\'avez pas de clé SSH ? Générez-en une :",
        sshKeygenCommand: 'ssh-keygen -t ed25519 -C "your-email@example.com"',
        keyName: 'Nom de la clé',
        keyNamePlaceholder: 'Ma clé générée',
        importantAfterGenerating:
            'Après la génération, vous devez télécharger et sauvegarder votre clé privée. Nous ne pouvons pas la récupérer si vous la perdez !',
        generateKeyPair: 'Générer la paire de clés',
        orGenerateLocallyRecommended: 'Ou générez localement (recommandé)',
        runThisInYourTerminal: 'Exécutez ceci dans votre terminal :',
        thenSwitchToIHave:
            'Puis passez à "Clé existante" et collez la clé publique.',
        savePrivateKeyNow:
            'Sauvegardez votre clé privée MAINTENANT ! Téléchargez-la avant de fermer cette fenêtre. Vous ne pourrez plus la voir.',
        privateKeyKeepSecret: 'Clé privée (gardez-la secrète !)',
        downloadPrivateKey: 'Télécharger la clé privée',
        publicKeyWillBeSaved: 'Clé publique (sera enregistrée)',
        savePublicKey: 'Enregistrer la clé publique'
    },
    landing: {
        title: "Déployez OpenClaw. Un clic. C\'est fait.",
        description:
            'Déployez OpenClaw sur votre propre VPS en un clic. Hébergement cloud auto-hébergeable avec accès root complet, emplacements mondiaux et tarifs transparents.',
        badge: 'OpenClaw simplifié',
        tutorialBadge: 'Regarde. Déploie.',
        tutorialVideoThumbnail: 'Miniature de la vidéo tutoriel ClawHost',
        heroTitle1: 'Déployez OpenClaw.',
        heroTitle2: "Un clic. C\'est fait.",
        heroDescription:
            'Déployez vos agents OpenClaw dans le cloud ou en local en un clic — créez, connectez et faites évoluer vos agents IA plus vite avec ClawHost.',
        goToClaws: 'Voir les Claws',
        selfHost: 'Open Source',
        startingPrice: 'À partir de',
        locations: 'Emplacements',
        servers: 'Serveurs',
        zeroCount: 'Zéro',
        zeroConfig: 'Zéro config',
        dashboardPreviewTitle: 'Claws',
        dashboardPreviewSubtitle: '5 claws ajoutés',
        deployNew: 'Déployer',
        running: 'En cours',
        latency: 'latence',
        howItWorks: 'Processus',
        threeStepsToPrivacy: 'Trois étapes vers OpenClaw',
        howItWorksDescription:
            'De zéro à un OpenClaw entièrement déployé, utilisable 24h/24 avec accès complet.',
        step1Title: 'Choisir un serveur',
        step1Description:
            'Choisissez parmi plus de 30 emplacements mondiaux chez trois fournisseurs. Nous déployons un VPS dédié pour vous en quelques secondes.',
        step2Title: 'Installation automatique',
        step2Description:
            'OpenClaw est préinstallé avec un lien direct et les détails du VPS. Aucune configuration nécessaire.',
        step3Title: "C\'est à vous",
        step3Description:
            'Accès complet à OpenClaw et au VPS, sans limites sur ce que vous pouvez accomplir.',
        features: 'Fonctions',
        whyClawHost: 'Fonctions tout-en-un',
        featuresDescription:
            "Pourquoi nous valons le coup d\'essayer, les fonctionnalités parlent d\'elles-mêmes.",
        zeroConfigDescription:
            "Évitez des heures de configuration de serveur et d\'OpenClaw. Tout est préinstallé et prêt en quelques minutes.",
        ownedData: 'Données 100% à vous',
        ownedDataDescription:
            'Votre propre serveur, vos données. Aucune infrastructure partagée, aucun journal, aucun tiers. En ligne 24h/24.',
        fullSpeed: 'Pleine vitesse',
        fullSpeedDescription:
            'Des ressources VPS dédiées signifient aucune limitation, pleine bande passante et internet ultra-rapide.',
        globalLocations: 'Emplacements mondiaux',
        globalLocationsDescription:
            "Déployez OpenClaw dans plusieurs régions mondiales et choisissez l'emplacement le plus proche de vous.",
        fullSshAccess: 'Accès SSH direct',
        fullSshAccessDescription:
            'Accédez au terminal de votre serveur directement depuis la plateforme. Aucun client SSH externe nécessaire.',
        secure: 'Sécurisé',
        secureDescription:
            'Protégé par défaut contre les vulnérabilités SSL, les logiciels malveillants et les menaces de sécurité courantes.',
        payAsYouGo: 'Tarifs simples',
        payAsYouGoDescription:
            'Tarification basée sur vos besoins. Pas de factures élevées imposées pour des serveurs de mauvaise qualité. Annulez à tout moment.',
        customSubdomains: 'Accès en ligne',
        customSubdomainsDescription:
            "Oubliez les réseaux locaux. Accédez à votre OpenClaw en toute sécurité depuis n\'importe où avec un sous-domaine.",
        autoUpdates: 'Contrôle de version',
        autoUpdatesDescription:
            "Passez à n\'importe quelle version d\'OpenClaw en un seul clic. Restez toujours à jour ou revenez en arrière si nécessaire.",
        openclawControl: 'Contrôle OpenClaw',
        openclawControlDescription:
            "Accédez au panneau natif d\'OpenClaw directement depuis ClawHost. Accès complet en édition à tout ce qu\'OpenClaw offre.",
        clawHostControl: 'Contrôle ClawHost',
        clawHostControlDescription:
            'Gérez les fichiers, mises à jour, canaux, variables, compétences et plus de configurations directement depuis la plateforme.',
        skillsMarketplace: '5 000+ compétences',
        skillsMarketplaceDescription:
            "Parcourez et installez plus de 5 000 compétences prêtes à l\'emploi en un seul clic. Étendez votre OpenClaw instantanément.",
        directChat: 'Chat direct',
        directChatDescription:
            "Discutez avec vos agents IA directement depuis la plateforme. Pas besoin d\'outils ou d\'interfaces externes.",
        multipleAgents: 'Agents multiples',
        multipleAgentsDescription:
            'Exécutez et gérez plusieurs agents IA sur une seule instance. Chacun avec sa propre configuration et son propre objectif.',
        multipleClaws: 'Claws multiples',
        multipleClawsDescription:
            'Déployez et gérez plusieurs instances OpenClaw depuis un seul tableau de bord. Évoluez selon vos besoins.',
        testimonials: 'Témoignages',
        whatPeopleSay: 'Ce que les gens disent',
        testimonialsDescription:
            "Ne nous croyez pas sur parole. Découvrez comment d\'autres déploient OpenClaw.",
        testimonial1Quote:
            "Enfin, mon propre serveur d\'IA. L\'installation a pris 30 secondes et je l\'utilise depuis des mois sans problème.",
        testimonial1Author: 'Alex Chen',
        testimonial1Role: 'Développeur logiciel',
        testimonial2Quote:
            "Plus besoin de partager des ressources avec d\'autres. Mon instance OpenClaw gère tout ce que je lui demande.",
        testimonial2Author: 'Maria Santos',
        testimonial2Role: 'Nomade numérique',
        testimonial3Quote:
            "Le déploiement en un clic est vraiment efficace. Je ne suis pas du tout technique mais j\'ai lancé mon OpenClaw en moins d\'une minute.",
        testimonial3Author: 'James Wilson',
        testimonial3Role: 'Freelance',
        testimonial4Quote:
            "J\'adore pouvoir voir exactement ce qui tourne sur mon serveur. Contrôle total sur ma configuration IA.",
        testimonial4Author: 'Sophie Kim',
        testimonial4Role: "Passionnée d\'IA",
        pricing: 'Tarifs',
        simpleTransparentPricing: 'Tarifs simples et transparents',
        pricingDescription:
            'Choisissez un plan adapté à vos besoins. Pas de frais cachés.',
        planColumn: 'Serveur',
        vCpuColumn: 'vCPU',
        ramColumn: 'RAM',
        storageColumn: 'Stockage',
        monthlyColumn: 'Prix',
        tierShared: 'vCPU partagé',
        tierDedicated: 'vCPU dédié',
        tierArm: 'Ampere (ARM)',
        tierRegular: 'Performance standard',
        tierHighPerformance: 'Haute performance',
        tierHighFrequency: 'Haute fréquence',
        recommended: 'Recommandé',
        perMonth: '/mois',
        perYear: '/an',
        yearlyDiscount: '— 2 mois offerts',
        billedYearly: 'facturé annuellement',
        deploy: 'Déployer',
        select: 'Sélectionner',
        selectPlanLabel: 'Sélectionner le plan {{plan}}',
        deployPlanLabel: 'Déployer le plan {{plan}}',
        openClawPreinstalled: 'OpenClaw préinstallé',
        unlimitedBandwidth: 'Bande passante illimitée',
        rootSshAccess: 'Accès root SSH complet',
        onlineAllDay: 'En ligne 24h/24',
        highQualityInternet: 'Internet de haute qualité',
        showAllPlans: 'Voir tous les plans',
        simplePricing: 'Simplifié',
        planStarter: 'Starter',
        planStarterDesc: '2 vCPU · 4 GB RAM · 40 GB',
        planGrowth: 'Growth',
        planGrowthDesc: '3 vCPU · 4 GB RAM · 80 GB',
        planPro: 'Pro',
        planProDesc: '4 vCPU · 16 GB RAM · 160 GB',
        planBusiness: 'Business',
        planBusinessDesc: '8 vCPU · 32 GB RAM · 240 GB',
        choosePlan: 'Choisir le plan',
        mostPopular: 'Le plus populaire',
        featurePreinstalled: 'OpenClaw pré-installé',
        featureBandwidth: 'Bande passante illimitée',
        featureSsh: 'Accès SSH root',
        featureUptime: 'En ligne 24/7',
        featureSharedCpu: 'CPU partagé',
        featureDedicatedCpu: 'CPU dédié',
        featureCommunitySupport: 'Support communautaire',
        featureInfraSupport: 'Support infrastructure',
        featureEmailSupport: 'Support par e-mail',
        fastInternet: 'Internet rapide',
        emailSupport: 'Support par e-mail',
        faqTitle: 'Questions',
        frequentlyAskedQuestions: 'Questions fréquentes',
        faqDescription:
            'Toutes les questions fréquemment posées, avec leurs réponses.',
        faq1Question: "Qu\'est-ce que ClawHost ?",
        faq1Answer:
            "ClawHost est une plateforme conçue pour rendre OpenClaw accessible à tous. Elle permet aux utilisateurs non techniques comme aux développeurs d\'utiliser OpenClaw sans gérer d\'infrastructure. Nous gérons les serveurs, la disponibilité, la sécurité et la maintenance — vous utilisez simplement OpenClaw.",
        faq2Question: "Qu\'est-ce qu\'OpenClaw ?",
        faq2Answer:
            "OpenClaw est une couche d\'accès sécurisée auto-hébergée pour vos outils et services d\'IA. Elle est préconfigurée pour la sécurité et les performances, vous pouvez donc la déployer et vous connecter instantanément.",
        faq3Question:
            "En quoi est-ce différent des autres outils d\'IA ou plateformes hébergées ?",
        faq3Answer:
            "Contrairement aux outils d\'IA hébergés, ClawHost vous offre un vrai serveur avec OpenClaw installé. Vous possédez l\'infrastructure, contrôlez tout et n\'êtes pas limité par une plateforme partagée ou un modèle.",
        faq4Question: 'Ai-je besoin de connaissances techniques ?',
        faq4Answer:
            "Non. Nous gérons toute l\'infrastructure, l\'installation et la maintenance. Vous pouvez configurer et gérer OpenClaw via son interface, vous connecter aux canaux et personnaliser l\'utilisation — sans toucher aux serveurs ou à l\'infrastructure.",
        faq5Question: 'Quels emplacements sont disponibles ?',
        faq5Answer:
            "Nous proposons plusieurs emplacements de serveurs dans le monde entier, incluant les États-Unis, l'Europe et plus encore. Vous pouvez déployer OpenClaw sur plusieurs serveurs dans différentes régions si nécessaire.",
        faq6Question: 'Combien ça coûte ?',
        faq6Answer:
            "Les tarifs dépendent du serveur que vous sélectionnez. Avec plusieurs options de serveurs allant de l'entrée de gamme à la haute performance, vous choisissez ce qui correspond à vos besoins et votre budget.",
        faq7Question: 'Puis-je accéder directement à mon serveur ?',
        faq7Answer:
            "Oui. En plus de l\'accès à OpenClaw via un sous-domaine, vous avez un accès complet au serveur et à son infrastructure sous-jacente, vous donnant une liberté totale pour personnaliser et exécuter tout ce dont vous avez besoin.",
        comparison: 'Comparaison',
        comparisonTitle: 'Ce qui nous distingue',
        comparisonDescription:
            "Il n\'existe qu\'une seule plateforme comparable, et notre approche se concentre sur de vrais serveurs et la pleine propriété plutôt que sur des limitations.",
        others: 'Autres',
        comparisonOpenClawUs: 'Accès complet à OpenClaw',
        comparisonOpenClawOthers: 'Uniquement le chat, pas de gestion',
        comparisonPricingUs: 'Tarifs transparents, spécifications claires',
        comparisonPricingOthers: 'Spécifications cachées, tarifs flous',
        comparisonOwnershipUs:
            'Vous êtes pleinement propriétaire de votre serveur',
        comparisonOwnershipOthers: 'Vous ne possédez rien',
        comparisonSubdomainUs: 'Accès via sous-domaine',
        comparisonSubdomainOthers: 'Accès uniquement via les canaux sociaux',
        comparisonInfraUs: 'Infrastructure à la demande',
        comparisonInfraOthers: 'Serveurs limités',
        comparisonDataUs: 'Vos données vous appartiennent',
        comparisonDataOthers: 'Vos données ne vous appartiennent pas',
        comparisonMultipleUs: 'Plusieurs OpenClaw, un seul Claw',
        comparisonMultipleOthers: 'Un seul OpenClaw',
        comparisonAgentsUs: 'Plusieurs agents par Claw',
        comparisonAgentsOthers: 'Un seul agent',
        comparisonOpenSourceUs: 'Entièrement open source',
        comparisonOpenSourceOthers: 'Code source fermé',
        comparisonExportUs: 'Exportez votre OpenClaw où vous voulez',
        comparisonExportOthers: 'Verrouillage fournisseur',
        comparisonProvidersUs: 'Plusieurs fournisseurs de serveurs',
        comparisonProvidersOthers: 'Un seul fournisseur',
        comparisonSocialsUs: 'Présence sur les réseaux sociaux',
        comparisonSocialsOthers: 'Pas de réseaux sociaux',
        comparisonChatUs: 'Chattez directement avec votre Claw',
        comparisonChatOthers: 'Chat uniquement via les canaux',
        comparisonVersionUs: 'Changement de version en un clic',
        comparisonVersionOthers: 'Mises à jour manuelles uniquement',
        comparisonTerminalUs: 'Terminal web intégré',
        comparisonTerminalOthers: 'Client SSH requis',
        seeFullComparison: 'Voir la comparaison complète',
        comparisonCtaText:
            'Nous comparons avec SimpleClaw, MyClaw.ai et plus — fonctionnalité par fonctionnalité.',
        readyToOwnYourPrivacy: 'Prêt à déployer OpenClaw ?',
        ctaDescription:
            'Obtenez un serveur dédié avec OpenClaw préinstallé. Accès root complet, emplacements mondiaux et prêt en quelques minutes. Vous en êtes propriétaire à tout moment. À partir de 25 $.',
        deployOpenClawNow: 'Déployer OpenClaw',
        selfHostInstead: 'Auto-héberger à la place',
        noCreditCardRequired: 'Installation instantanée',
        deployIn60Seconds: 'Sécurisé',
        demoClawStarted: 'Claw démarré.',
        demoClawStopped: 'Claw arrêté.',
        demoClawRestarting: 'Redémarrage du claw...',
        demoClawRestarted: 'Claw redémarré.',
        demoClawDeleted: 'Claw supprimé.',
        demoStatus: '{{running}} en cours, {{total}} au total'
    },
    blog: {
        title: 'Blog',
        description:
            "Guides, tutoriels et actualités sur OpenClaw et l\'infrastructure auto-hébergée.",
        readingTime: '{{minutes}} min de lecture',
        publishedOn: 'Publié le {{date}}',
        writtenBy: 'Par {{author}}',
        backToBlog: 'Retour au blog',
        noPosts: 'Aucun article',
        noPostsDescription:
            'Les articles de blog arrivent bientôt. Revenez plus tard.',
        ctaTitle: 'Déployez OpenClaw en un clic',
        ctaDescription:
            'Obtenez un serveur dédié avec OpenClaw préinstallé. Accès root complet, emplacements mondiaux et prêt en quelques minutes. Vous en êtes propriétaire à tout moment. À partir de 25 $.',
        ctaDeploy: 'Déployer OpenClaw',
        ctaGitHub: 'Voir sur GitHub'
    },
    changelog: {
        title: 'Journal des modifications',
        description:
            'Suivez les mises à jour, nouvelles fonctionnalités et améliorations de ClawHost.',
        subtitle:
            'Toutes les mises à jour, nouvelles fonctionnalités et améliorations de ClawHost.',
        upcomingRelease: 'En cours',
        upcomingReleaseTitle: 'Application mobile & Plus',
        upcomingReleaseDescription:
            "Gérez vos instances OpenClaw depuis n\'importe où. Une application mobile native, plus des améliorations continues de la plateforme.",
        upcomingReleaseFeature1:
            'Application mobile native pour surveiller et gérer vos instances OpenClaw en déplacement',
        upcomingReleaseFeature3: 'Support des thèmes sombre et clair',
        upcomingReleaseFeature4:
            'Améliorations de performance, stabilité et réactivité',
        upcomingReleaseFeature5:
            'Support multilingue avec anglais, français, espagnol et allemand',
        upcomingReleaseFeature6:
            'Pages de comparaison avec des analyses complètes face aux concurrents',
        upcomingReleaseFeature7:
            'Refactorisation de la structure des fonctionnalités du playground et simplifications',
        upcomingReleaseFeature8:
            'Demandes de fonctionnalités automatiquement gérées et publiées par les agents OpenClaw',
        upcomingReleaseFeature9:
            'Mode vocal pour interagir avec les agents OpenClaw hébergés sur ClawHost (Bêta)',
        upcomingReleaseFeature10:
            'Réinstaller OpenClaw sur votre instance pour repartir de zéro, disponible une fois par jour',
        upcomingReleaseFeature11:
            'Page de présentation de ClawHost Go, hébergement local avec ClawHost',
        upcomingReleaseFeature12:
            'Application de bureau pour macOS et Windows pour déployer OpenClaw localement en un clic',
        release13Date: '19 mars 2026',
        release13Title: 'Nouvelles langues & ClawHost Go Beta',
        release13Description:
            '10 nouvelles langues et ClawHost Go en bêta pour déployer OpenClaw localement en un clic sur macOS et Windows.',
        release13Feature1:
            '10 nouvelles langues ajoutées : chinois, hindi, arabe, russe, japonais, turc, italien, polonais, néerlandais et portugais',
        release13Feature2:
            'Version bêta de ClawHost Go pour macOS et Windows, déployez OpenClaw localement en un clic',
        release12Date: '14 mars 2026',
        release12Title: 'Abonnements annuels, mode vocal & plus',
        release12Description:
            "Abonnements annuels avec 2 mois offerts, mode vocal, réinstallation d'instance et une page de présentation initiale pour ClawHost Go.",
        release12Feature1:
            'Page de présentation de ClawHost Go, hébergement local avec ClawHost',
        release12Feature2:
            'Support des abonnements annuels avec 2 mois offerts pour un abonnement annuel',
        release12Feature3:
            'Mode vocal pour interagir avec les agents OpenClaw hébergés sur ClawHost',
        release12Feature4:
            'Réinstaller OpenClaw sur votre instance pour repartir de zéro, disponible une fois par jour',
        release11Date: '28 février 2026',
        release11Title:
            'Synthèse vocale, terminal, onglets de chat & explorateur de fichiers',
        release11Description:
            "Écoutez les réponses des agents avec la synthèse vocale, interagissez avec votre VPS directement via le terminal, naviguez plus rapidement dans les chats avec les onglets de la barre latérale, et explorez les fichiers avec l\'explorateur amélioré.",
        release11Feature1:
            'Synthèse vocale sur les messages des agents dans le playground',
        release11Feature2:
            'Terminal pour interagir avec vos instances VPS directement depuis le tableau de bord',
        release11Feature3:
            'Onglets de vue de la barre latérale du chat pour un accès et une navigation faciles',
        release11Feature4:
            "Améliorations de l\'explorateur de fichiers avec barre de recherche pour chercher dans les fichiers",
        release11Feature5:
            'Correction des horodatages des messages ne reflétant pas le temps réel',
        release11Dropped1:
            'Suppression des demandes de fonctionnalités pour simplification',
        release10Date: '22 février 2026',
        release10Title:
            'Demandes de fonctionnalités, explorateur de fichiers & corrections',
        release10Description:
            "Demandes de fonctionnalités communautaires, support élargi de l\'édition de fichiers et diverses corrections.",
        release10Feature1:
            'Demandes de fonctionnalités automatiquement gérées et publiées par les agents OpenClaw',
        release10Feature2:
            "Correction des compétences échouant parfois à s\'installer depuis le marketplace ClawHub",
        release10Feature3:
            'Correction du changement de fournisseur de modèle ne se reflétant pas et utilisant toujours le modèle initial',
        release10Feature4:
            'Plusieurs améliorations et corrections de bugs sur la plateforme',
        release10Feature5:
            "Les fichiers TypeScript, Markdown et texte brut sont maintenant modifiables dans l\'explorateur de fichiers",
        release9Date: '21 février 2026',
        release9Title: 'Comparaisons, refactorisation du playground & plus',
        release9Description:
            'Pages de comparaison avec les concurrents, restructuration des fonctionnalités du playground, support multilingue et améliorations globales de performance.',
        release9Feature1: 'Support des thèmes sombre et clair',
        release9Feature2:
            'Support multilingue avec anglais, français, espagnol et allemand',
        release9Feature3:
            'Pages de comparaison avec des analyses complètes face aux concurrents',
        release9Feature4:
            "Versions OpenClaw, mettez à jour en un clic ou installez n\'importe quelle version instantanément",
        release9Feature5:
            'Refactorisation de la structure des fonctionnalités du playground et simplifications',
        release9Feature6:
            'Améliorations de performance, stabilité et réactivité',
        release8Date: '18 février 2026',
        release8Title: 'Thème clair, Performance & Stabilité',
        release8Description:
            "Support du thème clair, améliorations de performance et d\'expérience, et améliorations de stabilité et de réactivité.",
        release8Feature1: 'Modes de thème clair, sombre et système',
        release8Feature2: "Améliorations de performance et d\'expérience",
        release8Feature3: 'Améliorations de stabilité et de réactivité',
        release7Date: '16 février 2026',
        release7Title: 'Refonte du chat & Saisie vocale',
        release7Description:
            'Améliorations majeures du chat et du playground avec interaction vocale, marketplace de compétences ClawHub et pièces jointes pour les agents.',
        release7Feature1:
            'Refonte du chat et du playground pour une expérience plus fluide et réactive',
        release7Feature2:
            'Interaction vocale avec les chats, enregistrement et transcription de la parole directement dans le navigateur',
        release7Feature3:
            'Intégration de compétences ClawHub avec plus de 5 000 compétences disponibles à installer et gérer',
        release7Feature4:
            "Affichage et utilisation des pièces jointes pour les agents, envoi d\'images et de documents dans le chat",
        release6Date: '16 février 2026',
        release6Title: "Canaux, Compétences & Chat d\'agent",
        release6Description:
            'Contrôle total de vos canaux, compétences et agents OpenClaw. Gérez et discutez avec tout directement depuis le tableau de bord.',
        release6Feature1:
            'Gestion directe des canaux, ajout, suppression et configuration des canaux sans toucher au serveur',
        release6Feature2:
            "Gestion directe des compétences, installation, mise à jour et organisation des compétences d\'agent depuis le tableau de bord",
        release6Feature3:
            "Discutez avec vos agents depuis le playground, interagissez avec n\'importe quel agent en temps réel",
        release6Feature4:
            'Connexion avec Google ou GitHub, authentification rapide et sécurisée sans codes par email',
        release1Date: '8 février 2026',
        release1Title: 'Version initiale',
        release1Description:
            'La première version officielle de ClawHost. Déployez OpenClaw sur votre propre VPS en un clic.',
        release1Feature1:
            "Déploiement d\'OpenClaw en un clic",
        release1Feature2:
            'Tableau de bord pour gérer les claws : démarrer, arrêter, redémarrer et supprimer des instances',
        release1Feature3:
            '18 offres de serveurs avec vCPU dédié, RAM et options de stockage',
        release1Feature4:
            '6 emplacements de serveurs aux États-Unis, en Europe et en Asie',
        release1Feature5:
            'Gestion des clés SSH pour un accès serveur sans mot de passe',
        release1Feature6:
            "Support de stockage supplémentaire par volume jusqu\'à 10 To",
        release1Feature7:
            'Authentification par lien magique, aucun mot de passe nécessaire',
        release1Feature8:
            'Accès en ligne à OpenClaw via des sous-domaines sécurisés',
        release1Feature9:
            'Intégration de paiement avec tarification transparente par serveur',
        release1Feature10: 'Historique de facturation et gestion des factures',
        release1Feature11:
            'Provisionnement automatique avec OpenClaw préinstallé et configuré',
        release2Date: '8 février 2026',
        release2Title: 'Changelog et plus',
        release2Description:
            'Une nouvelle façon de rester informé sur ClawHost.',
        release2Feature1:
            'Page de journal des modifications pour suivre toutes les mises à jour et versions de la plateforme',
        release3Date: '10 février 2026',
        release3Title: 'Aperçus serveur',
        release3Description:
            'Plus de visibilité et de contrôle sur vos serveurs, directement depuis le tableau de bord.',
        release3Feature1:
            'Journaux serveur en temps réel diffusés directement dans le tableau de bord',
        release3Feature2:
            'Diagnostics serveur avec réparation automatisée en un clic pour les problèmes de service',
        release3Feature3:
            'Explorateur de fichiers intégré et éditeur JSON pour les fichiers de configuration du serveur',
        release4Date: '14 février 2026',
        release4Title: 'Agents & Exportation de données',
        release4Description:
            "Playground d\'agents, gestion multi-agents et exportation portable des données pour vos instances OpenClaw.",
        release4Feature1:
            "Playground d\'agents en un clic et vue d\'ensemble, ajout et gestion de plusieurs agents",
        release4Feature2:
            "Exportez votre OpenClaw sous forme d\'archive zip portable",
        release4Feature3:
            'Playground interactif avec visualisation graphique des Claws et des agents',
        release4Feature4:
            "Suppression de la bascule vue grille/liste au profit d\'une mise en page unifiée du tableau de bord"
    },
    playground: {
        title: 'Playground',
        description:
            'Visualisez vos Claws et leurs agents dans un graphe interactif.',
        subtitle: 'Topologie des agents à travers votre infrastructure',
        noClawsYet: 'Aucun Claw',
        noClawsDescription: 'Déployez votre premier Claw pour interagir avec.',
        loadingAgents: 'Chargement des agents',
        unreachable: 'Injoignable',
        offline: 'Hors ligne',
        noAgents: 'Aucun agent',
        agentCount: '{{count}} Agent',
        agentCountPlural: '{{count}} Agents',
        agentModel: 'Modèle',
        zoomLabel: '{{percent}}%',
        fitView: 'Centrer',
        nodesOutOfView: 'Claws hors du champ',
        nodeOutOfView: 'Claw hors du champ',
        addAgent: 'Ajouter un agent',
        closeDetails: 'Fermer',
        tabInfo: 'Info',
        tabLogs: 'Journaux',
        tabDiagnostics: 'Santé',
        tabTerminal: 'Terminal',
        terminalConnecting: 'Connexion au terminal...',
        terminalDisconnected: 'Terminal déconnecté.',
        terminalError: 'Échec de connexion au terminal !',
        terminalReconnect: 'Reconnecter',
        tabDisabledConfiguring:
            "Disponible une fois la configuration de l\'instance terminée.",
        tabDisabledAwaitingPayment: 'Disponible une fois le paiement traité.',
        loadingTip1:
            "Saviez-vous que vous pouvez exécuter plusieurs agents au sein d\'un même OpenClaw ?",
        loadingTip2: "Saviez-vous qu\'OpenClaw est open source ?",
        loadingTip3:
            "ClawHost est le tout premier projet permettant l\'hébergement d\'OpenClaw en un clic.",
        tabChat: 'Chat',
        tabConfiguration: 'Configuration',
        tabSettings: 'Paramètres',
        tabEnvs: 'Envs',
        agentOnClaw: 'sur {{clawName}}',
        cannotDeleteDefaultAgent:
            "L\'agent par défaut ne peut pas être supprimé !",
        configurationModel: 'Modèle',
        configurationModelPlaceholder: 'Sélectionnez un modèle',
        configurationModelDescription:
            "Le modèle d\'IA utilisé par cet agent. Changer de modèle peut nécessiter de définir la clé API correspondante.",
        configurationEnvVars: "Variables d\'environnement",
        configurationEnvVarsDescription:
            "Clés API et variables d\'environnement stockées dans ~/.openclaw/.env sur l\'instance.",
        configurationAddEnvVar: 'Ajouter une variable',
        configurationKeyPlaceholder: 'NOM_VARIABLE',
        configurationValuePlaceholder: 'valeur',
        configurationSave: 'Enregistrer',
        configurationSaving: 'Enregistrement...',
        configurationSaved: "Configuration de l\'agent enregistrée.",
        configurationSaveFailed:
            "Échec de l\'enregistrement de la configuration de l\'agent !",
        configurationLoading: 'Chargement de la configuration...',
        configurationLoadFailed:
            "Échec du chargement de la configuration de l\'agent !",
        configurationLoadFailedDescription:
            'Impossible de récupérer la configuration de cet agent. Veuillez réessayer plus tard !',
        configurationRemoveVar: 'Supprimer',
        configurationApiKey: 'Clé API',
        configurationApiKeyDescription:
            "Requise pour {{modelName}}. Cette clé est stockée dans ~/.openclaw/.env sur l\'instance.",
        configurationApiKeyPlaceholder: 'Entrez votre clé API',
        tabVariables: 'Variables',
        variablesDescription:
            "Variables d\'environnement stockées dans ~/.openclaw/.env sur cette instance.",
        variablesEmpty: "Aucune variable d\'environnement trouvée.",
        variablesAddVariable: 'Ajouter une variable',
        variablesSave: 'Enregistrer les variables',
        variablesSaving: 'Enregistrement...',
        variablesSaved: "Variables d\'environnement enregistrées.",
        variablesSaveFailed:
            "Échec de l\'enregistrement des variables d\'environnement !",
        variablesLoading: 'Chargement des variables...',
        variablesLoadFailed:
            "Échec du chargement des variables d\'environnement !",
        variablesLoadFailedDescription:
            'Impossible de récupérer les variables pour cette instance. Veuillez réessayer plus tard !',
        variablesInvalidKey: 'Lettres, chiffres et underscores uniquement !',
        variablesEmptyValue: 'La valeur ne peut pas être vide !',
        variablesDuplicateKey: 'Nom de variable en double !',
        variablesDeleteTitle: 'Supprimer la variable',
        variablesDeleteDescription:
            "Êtes-vous sûr de vouloir supprimer {{key}} ? Cela la supprimera immédiatement de l\'instance.",
        variablesDeleteConfirm: 'Supprimer',
        variablesDontAskAgain:
            'Ne plus demander lors de la suppression de variables cette session',
        variablesDeleted: 'Variable supprimée.',
        variablesOperationPending:
            "Désactivé pendant qu\'une opération précédente se termine.",
        addAgentTitle: 'Ajouter un agent',
        addAgentDescription: 'Ajouter un nouvel agent à {{clawName}}.',
        addAgentDescriptionNoClaw:
            'Sélectionnez un claw et configurez votre nouvel agent.',
        addAgentSelectClaw: 'Claw',
        addAgentSelectClawPlaceholder: 'Sélectionnez un claw',
        addAgentName: 'Nom',
        addAgentNamePlaceholder: "Entrez le nom de l\'agent",
        addAgentModel: 'Modèle',
        addAgentModelPlaceholder: 'Sélectionnez un modèle',
        addAgentApiKey: 'Clé API',
        addAgentApiKeyPlaceholder: 'Entrez votre clé API (optionnel)',
        addAgentApiKeyConfigured:
            "{{envVar}} déjà configuré. Modifiable dans l\'onglet Variables après ajout.",
        addAgentSubmit: "Ajouter l\'agent",
        addAgentSuccess: 'Agent ajouté avec succès.',
        addAgentFailed: "Échec de l\'ajout de l\'agent !",
        deleteAgent: "Supprimer l\'agent",
        deleteAgentTitle: "Supprimer l\'agent",
        deleteAgentDescription:
            'Êtes-vous sûr de vouloir supprimer l\'agent "{{agentName}}" ? Cette action est irréversible. Les variables d\'environnement ne seront pas supprimées.',
        deleteAgentConfirm: 'Supprimer',
        agentDontAskAgain:
            "Ne plus demander lors de la suppression d\'agents cette session",
        deleteAgentDeleting: 'Suppression...',
        deleteAgentSuccess: 'Agent supprimé avec succès.',
        deleteAgentFailed: "Échec de la suppression de l\'agent !",
        configurationName: 'Nom',
        configurationNamePlaceholder: "Entrez le nom de l\'agent",
        configurationNameDescription: 'Lettres, chiffres et tirets uniquement.',
        agentNameRequired: "Le nom de l\'agent est requis !",
        agentNameInvalidChars:
            'Seuls les lettres, chiffres et tirets sont autorisés !',
        agentNameDuplicate: 'Un agent avec ce nom existe déjà !',
        chatConnecting: 'Connexion...',
        chatAuthenticating: 'Authentification...',
        chatDisconnected: 'Déconnecté',
        chatError: 'Erreur de connexion !',
        chatConnected: 'Connecté',
        chatInputPlaceholder: 'Écrivez un message...',
        chatInputDisabled: 'Connectez-vous pour discuter avec cet agent',
        chatSend: 'Envoyer le message',
        chatAbort: 'Arrêter',
        chatStopProcess: 'Arrêter le processus',
        chatRemoveAttachment: 'Supprimer la pièce jointe',
        chatThinking: 'Réflexion',
        chatLoadingHistory: 'Chargement des messages...',
        chatNoMessages: 'Aucun message',
        chatNoMessagesDescription:
            'Envoyez un message pour démarrer une conversation avec cet agent.',
        chatErrorMessage:
            'Une erreur est survenue lors de la génération de la réponse !',
        chatAbortedMessage: 'La réponse a été arrêtée.',
        chatPlaySpeech: 'Lire à voix haute',
        chatReplaySpeech: 'Rejouer',
        chatStopSpeech: 'Arrêter',
        chatSpeechFailed: 'Échec de la génération vocale !',
        chatReadOnlyPlaceholder: 'Chat disponible sur vos propres Claws.',
        chatReadOnlyUser:
            "Bonjour ! Pouvez-vous m\'aider à configurer un projet Node.js ?",
        chatReadOnlyAssistant:
            'Bien sûr ! Je peux vous aider à initialiser un nouveau projet Node.js. Souhaitez-vous que je crée un package.json avec quelques dépendances courantes ?',
        chatReadOnlyReply:
            'Ceci est un aperçu ! Déployez votre propre OpenClaw en un clic et commencez à discuter avec vos agents IA en quelques minutes !',
        chatReadOnlyUser2:
            'Pouvez-vous exécuter la suite de tests et vérifier les échecs ?',
        chatReadOnlyAssistant2:
            'Bien sûr ! Je lance tous les tests maintenant. 3 réussis, 0 échoués. Tout est bon — toutes les assertions passent.',
        chatReadOnlyGoUser:
            "Hey, peux-tu m'aider à automatiser mon pipeline de déploiement ?",
        chatReadOnlyGoAssistant:
            'Absolument ! Je peux configurer un pipeline CI/CD pour toi. Tu veux que je commence par un workflow GitHub Actions qui build, teste et déploie automatiquement ?',
        chatReadOnlyGoReply:
            'Ceci est un aperçu ! Obtenez ClawHost Go et exécutez OpenClaw localement — votre machine, vos données, pas de cloud nécessaire.',
        chatReadOnlyGoUser2:
            "Peux-tu surveiller mes services locaux et m'alerter si quelque chose tombe en panne ?",
        chatReadOnlyGoAssistant2:
            "C'est parti ! Je configure des vérifications de santé pour tous tes services. Surveillance en cours de 4 endpoints — tous en bonne santé et réactifs.",
        chatConnectionFailed: 'Échec de la connexion à cet agent !',
        chatConnectionFailedDescription:
            "Assurez-vous que le Claw est en cours d\'exécution et joignable !",
        chatNotConfigured: 'Agent non configuré !',
        chatNotConfiguredDescription:
            "Sélectionnez un modèle et définissez une clé API dans l\'onglet Configuration pour commencer à discuter !",
        chatConfigureButton: "Configurer l\'agent",
        chatToday: "Aujourd\'hui",
        chatYesterday: 'Hier',
        chatExpandFullscreen: 'Agrandir le chat',
        chatAttachFile: 'Joindre un fichier',
        chatDropFiles: 'Déposez des fichiers à joindre',
        chatDropFilesDescription:
            "Images, PDF et fichiers texte jusqu\'à 5 Mo.",
        chatVoiceInput: 'Saisie vocale',
        chatVoiceListening: 'Écoute en cours...',
        chatVoiceNotSupported:
            "La saisie vocale n\'est pas supportée dans ce navigateur !",
        chatVoiceMode: 'Mode vocal',
        chatVoiceModeTapToSpeak: 'Appuyez pour commencer à parler',
        chatVoiceModeListening: 'Écoute en cours...',
        chatVoiceModeClose: 'Quitter le mode vocal',
        chatVoiceModeTranscribing: 'Transcription en cours...',
        chatVoiceModeThinking: 'Réflexion en cours...',
        chatVoiceModeResponding: 'Réponse en cours...',
        chatVoiceModePreparing: 'Préparation de la parole...',
        chatVoiceModeSpeaking: 'Parle...',
        chatVoiceModeInputDevice: 'Microphone',
        chatVoiceModeOutputDevice: 'Haut-parleur',
        chatVoiceModeNotSupported:
            "La reconnaissance vocale n\'est pas supportée dans ce navigateur.",
        chatVoiceModeNoMicrophone:
            'Aucun microphone détecté. Connectez-en un pour utiliser le mode vocal.',
        chatVoiceModeNoSpeaker:
            'Aucun haut-parleur détecté. Connectez-en un pour utiliser le mode vocal.',
        chatAttachmentNotSupported:
            "Ce type de fichier n\'est pas supporté. Utilisez des images, PDF ou fichiers texte !",
        chatNoPreview: 'Aucun aperçu disponible.',
        chatDownloadFile: 'Télécharger le fichier',
        chatCopyMessage: 'Copier le message',
        tabChannels: 'Canaux',
        channelsDescription:
            'Configurez les canaux de messagerie pour cette instance. Les messages sont acheminés vers les agents via des liaisons.',
        channelsWhatsApp: 'WhatsApp',
        channelsWhatsAppPairDevice: 'Associer un appareil',
        channelsWhatsAppPairing: 'En attente du code QR...',
        channelsWhatsAppScanQr:
            'Scannez ce code QR avec WhatsApp pour associer votre appareil.',
        channelsWhatsAppScanInstructions:
            'Ouvrez WhatsApp > Paramètres > Appareils connectés > Connecter un appareil',
        channelsWhatsAppQrRefreshed:
            'Le QR code précédent a expiré. Scannez le nouveau ci-dessous.',
        channelsWhatsAppPaired: 'WhatsApp associé avec succès.',
        channelsWhatsAppPairFailed: 'Échec du couplage. Veuillez réessayer !',
        channelsWhatsAppAlreadyPaired: 'WhatsApp est déjà associé !',
        channelsWhatsAppUnpair: 'Dissocier',
        channelsWhatsAppConnected: 'Connecté',
        channelsWhatsAppRepair: 'Re-coupler',
        channelsWhatsAppChecking: 'Vérification de la connexion...',
        channelsVersionUnsupported:
            "La configuration des canaux n'est pas disponible sur cette version. Vous pouvez connecter manuellement via l'onglet Terminal ou mettre à jour OpenClaw.",
        channelsVersionUnsupportedDocs: 'Voir le guide de configuration',
        featureVersionUnsupported: '{{feature}} non pris en charge sur {{version}}',
        featureVersionUnsupportedDescription: 'Nous ne prenons pas en charge la gestion de {{feature}} avec cette version via notre interface. Vous pouvez toujours le gérer via SSH, Terminal ou le panneau de contrôle OpenClaw.',
        featureVersionUnsupportedButton: 'Aller aux Versions',
        featureVersionUnsupportedSupported: 'Versions prises en charge :',
        featureVersionUnsupportedNewer: 'versions plus récentes',
        channelsTelegram: 'Telegram',
        channelsDiscord: 'Discord',
        channelsSlack: 'Slack',
        channelsSignal: 'Signal',
        channelsEnabled: 'Activé',
        channelsAccount: 'Numéro de téléphone du compte',
        channelsAccountPlaceholder: '+33612345678',
        channelsBotToken: 'Jeton du bot',
        channelsBotTokenPlaceholder: 'Entrez le jeton du bot',
        channelsAppToken: "Jeton de l\'application",
        channelsAppTokenPlaceholder: "Entrez le jeton de l\'application",
        channelsToken: 'Jeton du bot',
        channelsTokenPlaceholder: 'Entrez le jeton du bot',
        channelsSigningSecret: 'Secret de signature',
        channelsSigningSecretPlaceholder: 'Entrez le secret de signature',
        channelsDmPolicy: 'Politique de messages privés',
        channelsDmPolicyOpen: 'Ouvert',
        channelsDmPolicyPairing: 'Appariement',
        channelsDmPolicyAllowlist: 'Liste autorisée',
        channelsDmPolicyDisabled: 'Désactivé',
        channelsAllowFrom: 'Autoriser depuis',
        channelsAllowFromPlaceholder: 'IDs autorisés, séparés par des virgules',
        channelsSave: 'Enregistrer',
        channelsSaved: 'Canaux mis à jour avec succès.',
        channelsSaveFailed: 'Échec de la mise à jour des canaux !',
        channelsLoading: 'Chargement des canaux...',
        channelsLoadFailed: 'Échec du chargement des canaux !',
        channelsLoadFailedDescription:
            'Impossible de récupérer la configuration des canaux. Veuillez réessayer !',
        channelsNoChanges: 'Aucune modification à enregistrer.',
        bindingsDescription:
            'Assignez des canaux de messagerie à cet agent. Chaque canal ne peut être routé que vers un seul agent à la fois.',
        bindingsNoChannels: 'Aucun canal activé.',
        bindingsNoChannelsDescription:
            "Activez des canaux dans les paramètres de l\'instance d\'abord, puis assignez-les aux agents ici.",
        bindingsSaving: 'Enregistrement...',
        bindingsSaved: 'Liaisons mises à jour avec succès.',
        bindingsSaveFailed: 'Échec de la mise à jour des liaisons !',
        tabSkills: 'Compétences',
        skillsDescription:
            'Gérez les compétences partagées disponibles pour tous les agents sur cette instance.',
        skillsSearch: 'Rechercher des compétences...',
        skillsNoResults: 'Aucune compétence ne correspond à votre recherche.',
        skillsEmpty: 'Aucun Skill',
        skillsSave: 'Enregistrer les compétences',
        skillsSaved: 'Compétences mises à jour avec succès.',
        skillsSaveFailed: 'Échec de la mise à jour des compétences !',
        skillsLoading: 'Chargement des compétences...',
        skillsLoadFailed: 'Échec du chargement des compétences !',
        skillsLoadFailedDescription:
            'Impossible de récupérer la configuration des compétences. Veuillez réessayer !',
        agentSkillsDescription:
            "Compétences installées dans l\'espace de travail de cet agent.",
        agentSkillsInstalling: 'Installation...',
        agentSkillsInstalled: 'Compétence installée avec succès.',
        agentSkillsInstallFailed: "Échec de l\'installation de la compétence !",
        agentSkillsRemoving: 'Suppression...',
        agentSkillsRemoved: 'Compétence supprimée avec succès.',
        agentSkillsRemoveFailed: 'Échec de la suppression de la compétence !',
        agentSkillsEmpty: 'Aucune compétence installée.',
        agentSkillsEmptyDescription:
            'Installez une compétence pour étendre les capacités de cet agent.',
        agentSkillsNamePlaceholder: 'Nom de la compétence',
        agentSkillsConfirmRemove: 'Supprimer la compétence "{{skillName}}" ?',
        agentSkillsConfirmRemoveDescription:
            "Cela supprimera la compétence de l\'espace de travail de l\'agent.",
        skillsBundledTab: 'Intégrées',
        skillsClawHubTab: 'ClawHub',
        clawHubSearch: 'Rechercher des compétences ClawHub...',
        clawHubNoResults: 'Aucune compétence trouvée sur ClawHub.',
        clawHubEmpty: 'Aucune compétence ClawHub installée.',
        clawHubEmptyDescription:
            'Recherchez et installez des compétences depuis la marketplace ClawHub.',
        clawHubInstall: 'Installer',
        clawHubInstalled: 'Compétence installée depuis ClawHub.',
        clawHubInstallFailed:
            "Échec de l\'installation de la compétence depuis ClawHub !",
        clawHubRemove: 'Supprimer',
        clawHubRemoved: 'Compétence ClawHub supprimée.',
        clawHubRemoveFailed:
            'Échec de la suppression de la compétence ClawHub !',
        clawHubUpdate: 'Mettre à jour',
        clawHubUpdated: 'Compétence mise à jour depuis ClawHub.',
        clawHubUpdateFailed:
            'Échec de la mise à jour de la compétence ClawHub !',
        clawHubUpdateAvailable: 'v{{version}} disponible',
        clawHubBy: 'par {{author}}',
        clawHubDownloads: '{{count}} téléchargements',
        clawHubVersion: 'v{{version}}',
        clawHubLoadFailed: 'Échec du chargement de ClawHub !',
        clawHubLoadFailedDescription:
            'Impossible de se connecter à la marketplace ClawHub. Veuillez réessayer !',
        tabVersions: 'Versions',
        versionsSearch: 'Rechercher des versions...',
        versionsEmpty: 'Aucune version trouvée',
        versionsEmptyDescription:
            'Aucune version ne correspond à votre recherche.',
        versionsErrorDescription:
            'Impossible de charger les versions. Veuillez vérifier votre connexion et réessayer !',
        versionsChangelog: 'Voir les changelogs sur npm',
        versionCurrent: 'Actuelle',
        versionLatest: 'Dernière',
        versionInstall: 'Installer',
        versionInstalling: 'Installation...',
        versionInstallSuccess: 'Version {{version}} installée avec succès.',
        versionInstallFailed: "Impossible d\'installer la version !",
        versionDownloads: '{{count}} téléchargements',
        versionChangelog: 'Changelog',
        versionOutdated: 'Obsolète',
        versionInstallConfirmTitle: 'Installer la version {{version}}',
        versionInstallConfirmDescription:
            "Le changement de version peut provoquer un comportement inattendu ou nécessiter une configuration manuelle supplémentaire, notamment pour les versions plus récentes qui n\'ont pas encore été entièrement vérifiées. Voulez-vous continuer ?",
        settingsName: 'Nom',
        settingsNamePlaceholder: 'Entrez le nom du claw',
        settingsNameDescription: 'Lettres, chiffres et tirets uniquement.',
        subdomain: 'Sous-domaine',
        subdomainPlaceholder: 'Entrez le sous-domaine',
        subdomainDescription:
            'Lettres minuscules et chiffres, {{min}}-{{max}} caractères.',
        subdomainInvalid:
            'Utilisez {{min}}-{{max}} lettres minuscules et chiffres uniquement !',
        subdomainUpdated: 'Sous-domaine mis à jour avec succès.',
        subdomainUpdateFailed: 'Échec de la mise à jour du sous-domaine !',
        subdomainInUse: 'Ce sous-domaine est utilisé par un autre claw !',
        settingsSave: 'Enregistrer',
        settingsSaving: 'Enregistrement...',
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
        title: 'Politique de confidentialité',
        description:
            'Découvrez comment ClawHost collecte, utilise et protège vos données personnelles.',
        lastUpdated: 'Dernière mise à jour : 14 mars 2026',
        introTitle: '1. Introduction',
        introText:
            "ClawHost (« nous », « notre ») s\'engage à protéger votre vie privée. Cette Politique de confidentialité explique comment nous collectons, utilisons, divulguons et protégeons vos informations lorsque vous utilisez notre Service.",
        authTitle: '2. Authentification',
        authText:
            "ClawHost utilise Google Firebase Authentication pour gérer les comptes utilisateurs. Vous pouvez vous connecter avec un email, Google ou GitHub. En utilisant ces méthodes de connexion, vous acceptez leurs conditions et politiques de confidentialité respectives. Ces fournisseurs peuvent collecter des données de base telles que votre adresse email, votre nom et les informations de votre appareil. Nous ne stockons que votre adresse email et votre nom d\'affichage.",
        collectTitle: '3. Informations que nous collectons',
        collectText:
            'Nous collectons des informations de la manière suivante :',
        personalInfoTitle: 'Informations personnelles',
        personalInfoEmail:
            'Adresse email (pour la création de compte et la communication)',
        personalInfoName: 'Nom (optionnel, pour la personnalisation)',
        personalInfoPayment:
            'Informations de paiement (traitées de manière sécurisée par des prestataires tiers)',
        serverInfoTitle: 'Informations sur le serveur',
        serverInfoConfig:
            'Configuration et statut du serveur',
        serverInfoIp: 'Adresse IP et emplacement du serveur',
        serverInfoResources: 'Allocation des ressources (CPU, RAM, stockage)',
        useTitle: '4. Comment nous utilisons vos informations',
        useText: 'Nous utilisons les informations collectées pour :',
        useProvide: 'Fournir et maintenir notre Service',
        useTransactions:
            'Traiter les transactions et envoyer les informations de facturation',
        useNotices: 'Envoyer des avis importants et des mises à jour',
        useSupport: 'Répondre aux demandes de support client',
        useAnalyze:
            "Surveiller et analyser les habitudes d\'utilisation pour améliorer notre Service",
        useFraud: 'Détecter et prévenir la fraude ou les abus',
        sharingTitle: '5. Partage et divulgation des données',
        sharingText:
            'Nous ne vendons pas vos informations personnelles. Nous pouvons partager des informations avec :',
        sharingProviders:
            "Les prestataires de services qui nous aident à exploiter notre Service (ex. : fournisseurs d\'infrastructure cloud)",
        sharingLegal:
            "Les autorités légales lorsque la loi l\'exige ou pour protéger nos droits",
        sharingBusiness:
            "Les partenaires commerciaux en cas de fusion, acquisition ou vente d\'actifs",
        securityTitle: '6. Sécurité des données',
        securityText:
            "Nous mettons en œuvre des mesures techniques et organisationnelles appropriées pour protéger vos informations personnelles contre l\'accès non autorisé, la modification, la divulgation ou la destruction. Cela inclut le chiffrement, des serveurs sécurisés et des évaluations de sécurité régulières.",
        retentionTitle: '7. Conservation des données',
        retentionText:
            'Nous conservons vos informations personnelles aussi longtemps que votre compte est actif ou que nécessaire pour vous fournir des services. Nous pouvons conserver certaines informations selon les exigences légales ou pour des besoins commerciaux légitimes.',
        rightsTitle: '8. Vos droits',
        rightsText: 'Selon votre localisation, vous pouvez avoir le droit de :',
        rightsAccess: 'Accéder à vos données personnelles',
        rightsCorrect: 'Corriger les données inexactes',
        rightsDelete: 'Demander la suppression de vos données',
        rightsObject: 'Vous opposer au traitement de vos données',
        rightsPortability: 'Portabilité des données',
        rightsWithdraw: 'Retirer votre consentement à tout moment',
        cookiesTitle: '9. Cookies et suivi',
        cookiesText:
            "Nous n\'utilisons pas de cookies. L\'authentification est gérée par Firebase et ne repose pas sur des cookies stockés dans votre navigateur.",
        transfersTitle: '10. Transferts internationaux de données',
        transfersText:
            'Vos informations peuvent être transférées et traitées dans des pays autres que le vôtre. Nous veillons à ce que des garanties appropriées soient en place pour protéger vos données conformément à cette Politique de confidentialité.',
        eligibilityTitle: '11. Éligibilité',
        eligibilityText:
            "Notre Service est accessible à tous. Il n\'y a aucune restriction d\'âge pour utiliser ClawHost.",
        changesTitle: '12. Modifications de cette politique',
        changesText:
            'Nous pouvons mettre à jour cette Politique de confidentialité de temps à autre. Nous vous informerons de tout changement en publiant la nouvelle Politique de confidentialité sur cette page et en mettant à jour la date de « Dernière mise à jour ».',
        contactTitle: '13. Nous contacter',
        contactText:
            'Si vous avez des questions concernant cette Politique de confidentialité ou souhaitez exercer vos droits, veuillez nous contacter à'
    },
    terms: {
        title: "Conditions d\'utilisation",
        description:
            "Lisez les termes et conditions d\'utilisation des services ClawHost.",
        lastUpdated: 'Dernière mise à jour : 14 mars 2026',
        acceptanceTitle: '1. Acceptation des conditions',
        acceptanceText:
            "En accédant et en utilisant ClawHost (« Service »), vous acceptez d\'être lié par les termes et dispositions de cet accord. Si vous n\'acceptez pas ces conditions, veuillez ne pas utiliser notre Service.",
        serviceTitle: '2. Description du Service',
        serviceText:
            "ClawHost fournit un déploiement d\'OpenClaw en un clic sur des serveurs dédiés. Nous permettons aux utilisateurs de déployer, gérer et accéder à des instances OpenClaw préconfigurées avec un accès root complet et des ressources dédiées.",
        authTitle: '3. Authentification',
        authText:
            'ClawHost utilise Google Firebase Authentication pour gérer la connexion. Vous pouvez vous authentifier avec un email, Google ou GitHub. En utilisant ces méthodes, vous acceptez les conditions et politiques de confidentialité respectives de Google et GitHub. Ces fournisseurs peuvent collecter des informations de base telles que votre adresse email, votre nom et les données de votre appareil.',
        responsibilitiesTitle: "4. Responsabilités de l\'utilisateur",
        responsibilitiesText: 'Vous vous engagez à :',
        responsibilitiesAccurate:
            "Fournir des informations d\'inscription exactes et complètes",
        responsibilitiesSecurity:
            'Maintenir la sécurité de vos identifiants de compte',
        responsibilitiesCompliance:
            'Utiliser le Service en conformité avec toutes les lois applicables',
        responsibilitiesLegal:
            'Ne pas utiliser le Service à des fins illégales ou non autorisées',
        responsibilitiesAccess:
            "Ne pas tenter d\'obtenir un accès non autorisé à des systèmes ou réseaux",
        prohibitedTitle: '5. Utilisations interdites',
        prohibitedText: 'Vous ne pouvez pas utiliser notre Service pour :',
        prohibitedMalware:
            'Distribuer des logiciels malveillants, virus ou tout logiciel nuisible',
        prohibitedDos:
            'Mener des attaques par déni de service ou abus de réseau',
        prohibitedSpam: 'Envoyer du spam ou des communications non sollicitées',
        prohibitedIllegal: 'Héberger ou distribuer du contenu illégal',
        prohibitedIp:
            'Violer les droits de tiers, y compris la propriété intellectuelle',
        prohibitedMining: 'Miner des cryptomonnaies',
        prohibitedOther:
            'Toute autre activité illicite ou nuisible que nous pourrions juger inappropriée à notre discrétion',
        paymentTitle: '6. Paiement et facturation',
        paymentText:
            "Les services sont facturés sur une base mensuelle ou annuelle fixe. Vous pouvez passer d\'une facturation mensuelle à annuelle ou inversement à tout moment, le changement prenant effet au début de votre prochaine période de facturation. Tous les paiements sont non remboursables. Lorsque vous payez pour un serveur, vous y avez accès pour toute la période de facturation. Si vous annulez, l\'annulation prend effet à la fin de la période de facturation en cours. Les prix sont susceptibles de changer, mais les modifications ne s\'appliqueront qu\'aux nouveaux claws déployés et n\'affecteront pas ceux déjà en service. Le défaut de paiement peut entraîner la suspension ou la résiliation de votre compte.",
        availabilityTitle: '7. Disponibilité du Service',
        availabilityText:
            'Nous nous efforçons de maintenir une haute disponibilité mais ne garantissons pas un accès ininterrompu au Service. Nous nous réservons le droit de modifier, suspendre ou interrompre tout ou partie du Service à tout moment, avec ou sans préavis.',
        liabilityTitle: '8. Limitation de responsabilité',
        liabilityText:
            "Dans la mesure maximale permise par la loi, ClawHost ne sera pas responsable des dommages indirects, accessoires, spéciaux, consécutifs ou punitifs, ni de toute perte de profits ou de revenus, qu\'ils soient subis directement ou indirectement.",
        terminationTitle: '9. Résiliation',
        terminationText:
            "Nous pouvons résilier ou suspendre votre compte et l\'accès au Service immédiatement, sans préavis, pour tout comportement que nous estimons contraire à ces Conditions ou nuisible à d\'autres utilisateurs, à nous-mêmes ou à des tiers, ou pour toute autre raison.",
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
        changesToTermsTitle: '11. Modifications des conditions',
        changesToTermsText:
            "Nous nous réservons le droit de modifier ces conditions à tout moment. Nous informerons les utilisateurs de tout changement important par email ou via le Service. L\'utilisation continue du Service après de telles modifications constitue l\'acceptation des conditions mises à jour.",
        contactTitle: '12. Coordonnées',
        contactText:
            'Si vous avez des questions concernant ces Conditions, veuillez nous contacter à'
    },
    mobile: {
        messages: 'Messages',
        settings: 'Paramètres',
        comingSoon: 'Bientôt disponible',
        messagesPlaceholder: 'Les messages et notifications apparaîtront ici.',
        settingsPlaceholder:
            'Les paramètres du compte et les préférences apparaîtront ici.',
        signIn: 'Se connecter',
        signInDescription: 'Connectez-vous pour gérer vos instances OpenClaw.',
        enterEmail: 'Adresse email',
        emailPlaceholder: 'exemple@clawhost.cloud',
        continueWithEmail: "Continuer avec l\'email",
        otpDescription:
            'Nous vous enverrons un code pour vous connecter. Aucun mot de passe nécessaire.',
        sending: 'Envoi...',
        checkYourEmail: 'Vérifiez votre email',
        codeSentTo: 'Nous avons envoyé un code à 6 chiffres à',
        enterCode: 'Entrez le code reçu par email',
        resendCode: 'Renvoyer le code',
        resendIn: 'Renvoyer dans {{seconds}}s',
        changeEmail: "Changer d\'email",
        invalidCode: 'Code invalide !',
        codeExpired: 'Code expiré. Veuillez en demander un nouveau !',
        signingIn: 'Connexion en cours...',
        signOut: 'Se déconnecter',
        signedInAs: 'Connecté en tant que',
        loadMore: 'Charger plus',
        chatWithYourClaw: 'Discutez avec votre Claw',
        deployClaw: 'Déployer un Claw',
        deployYourFirstClaw: 'Déployez votre premier Claw',
        voiceMode: 'Mode vocal',
        voiceListening: 'Écoute en cours...',
        voiceTapToSpeak: "Appuyez sur l\'orbe pour commencer"
    },
    announcement: {
        title: 'Avis de service',
        message:
            'En raison de la forte demande, le déploiement de Claw est temporairement indisponible. Les claws existants fonctionnent normalement.'
    },
    productHunt: {
        liveOn: 'En direct sur',
        productHunt: 'Product Hunt',
        celebrate: 'Soutenez-nous & profitez de',
        discount: '10% de réduction',
        yourFirstMonth: 'sur votre première commande',
        upvoteNow: 'Votez pour nous'
    },
    compare: {
        title: 'Comparaison complète',
        description:
            "Découvrez comment ClawHost se compare aux autres plateformes d\'hébergement OpenClaw.",
        badge: 'Comparaison',
        feature: 'Plateforme',
        compareWith: 'Comparer avec',
        lastUpdated: 'Dernière mise à jour : mars 2026',
        competitorClawHost: 'ClawHost',
        competitorLobsterFarm: 'LobsterFarm',
        competitorSimpleClaw: 'SimpleClaw',
        competitorMyClawAi: 'MyClaw.ai',
        competitorQuickClaw: 'QuickClaw',
        categoryInfrastructure: 'Infrastructure',
        categoryPricing: 'Tarification & Facturation',
        categoryDeployment: 'Déploiement & Configuration',
        categoryManagement: 'Gestion OpenClaw',
        categorySecurity: 'Données & Sécurité',
        categoryMonitoring: 'Surveillance & Maintenance',
        categorySupport: 'Support & Plateforme',
        featureServerOwnership: 'Propriété du serveur',
        featureProviderChoice: 'Choix du fournisseur cloud',
        featureDedicatedResources: 'Ressources dédiées',
        featureRootAccess: 'Accès root/SSH complet',
        featureServerLocations: 'Emplacements des serveurs',
        featureStartingPrice: 'Prix de départ',
        featureTransparentPricing: 'Tarification transparente',
        featurePowerfulServers: 'Serveurs puissants, prix réduit',
        featureLocationSelection: "Choisir l\'emplacement du serveur",
        featureSubdomainAccess: 'Accès par sous-domaine',
        featureThemes: 'Thèmes clair et sombre',
        featureSetupTime: 'Temps de configuration',
        featureTechnicalSkill: 'Compétences techniques requises',
        featureOneClickDeploy: 'Déploiement en un clic',
        featureMultipleInstances: 'Instances multiples',
        featureMultipleAgents: 'Agents multiples par instance',
        featureSkillsMarketplace: 'Marketplace de compétences',
        featureChannelSupport: 'Support des canaux',
        featureAgentConfig: 'Configuration des agents',
        featureDataOwnership: 'Propriété complète des données',
        featureDataExport: 'Export des données',
        featureBackups: 'Sauvegardes',
        featureSecurityHardening: 'Renforcement de la sécurité',
        featureSslTls: 'SSL/TLS',
        featureOpenSource: 'Open source',
        featureAutoUpdates: 'Mises à jour automatiques',
        featureDiagnostics: 'Diagnostics en temps réel',
        featureLogStreaming: 'Streaming des journaux',
        featureRepairTools: 'Outils de réparation',
        featureSupportChannels: 'Canaux de support',
        featureMultiLanguage: 'Interface multilingue',
        featureMobileApp: 'Application mobile',
        featureDesktopApp: 'Application de bureau',
        featureDirectChat: 'Chat direct',
        featureOneClickVersion: 'Changement de version en un clic',
        featureWebTerminal: 'Terminal web',
        featureSocials: 'Réseaux sociaux',
        dedicatedVps: 'VPS dédié',
        sharedContainers: 'Conteneurs partagés',
        isolatedContainers: 'Conteneurs isolés',
        cloudWorkspaces: 'Espaces de travail cloud',
        threeProviders: 'Cloud',
        singleProvider: 'Fournisseur unique',
        fullyDedicated: 'Entièrement dédié',
        shared: 'Partagé',
        fullRootSsh: 'Root + SSH complet',
        sshOnRequest: 'SSH sur demande',
        noAccess: "Pas d\'accès",
        thirtyPlusLocations: '30+ emplacements',
        limitedLocations: 'Limité',
        fourLocations: '4 emplacements',
        fromTwentyFiveMonth: 'À partir de 25 $/mois',
        aboutFortyFourMonth: '~44 $/mois en moyenne',
        fromNineteenMonth: '19–79 $/mois',
        nineteenMonth: '19 $/mois',
        clearSpecsPricing: 'Spécifications et prix clairs',
        unclearPricing: 'Tarification floue',
        fixedTiers: '3 niveaux fixes',
        creditBased: 'Basé sur des crédits',
        minutes: 'Minutes',
        underOneMinute: "Moins d\'une minute",
        thirtySeconds: '30 secondes',
        instant: 'Instantané',
        noneRequired: 'Aucune',
        minimal: 'Minimal',
        unlimited: 'Illimité',
        singleInstance: 'Unique',
        fiveThousandSkills: '5 000+ compétences (ClawHub)',
        noMarketplace: 'Pas de marketplace',
        allChannels: 'WhatsApp, Telegram, Discord, Slack, Signal',
        telegramDiscord: 'Telegram, Discord',
        discordGithubSlack: 'Discord, GitHub, Slack',
        telegramGmailWhatsapp: 'Telegram, Gmail, WhatsApp',
        appOnly: 'Application uniquement',
        fullConfig: 'Configuration complète',
        limitedConfig: 'Limitée',
        zipExport: 'Export ZIP',
        serverTransfer: 'Transfert de serveur',
        noExport: "Pas d\'export",
        volumeStorage: 'Stockage en volumes',
        noBackups: 'Pas de sauvegardes',
        dailyBackups: 'Sauvegardes quotidiennes',
        included: 'Inclus',
        notIncluded: 'Non inclus',
        managed: 'Géré',
        manual: 'Manuel',
        appStore: 'App Store',
        liveMonitoring: 'Surveillance en direct',
        liveLogs: 'Journaux en direct',
        oneClickRepair: 'Réparation en un clic',
        emailGithub: 'Email, GitHub',
        humanSupport: 'Support humain',
        communityOnly: 'Communauté uniquement',
        appSupport: 'Support via application',
        prioritySupport: 'Support 24/7 (Pro+)',
        fourLanguages: '4 langues',
        englishOnly: 'Anglais uniquement',
        available: 'Disponible',
        comingSoon: 'Bientôt disponible',
        iosMacOs: 'iOS & macOS',
        macOsOnly: 'macOS uniquement',
        viaTelegram: 'Via Telegram',
        builtInChat: 'Intégré',
        builtInTerminal: 'Sans SSH',
        notAvailable: 'Non disponible',
        disclaimer: 'Quelque chose a changé ou est incorrect ? Écrivez-nous à',
        disclaimerOr: 'ou ouvrez une pull request sur',
        github: 'GitHub',
        ctaTitle: 'Prêt à voir la différence ?',
        ctaDescription:
            'Déployez OpenClaw sur votre propre serveur dédié. Propriété complète, tarification transparente et prêt en minutes.'
    },
    affiliate: {
        title: 'Affiliation',
        description: 'Gagnez des récompenses en parrainant vos amis sur ClawHost.',
        subtitle: 'Partagez votre lien de parrainage et gagnez des récompenses.',
        referralCode: 'Code de parrainage',
        referrals: 'Parrainages',
        earnings: 'Revenus',
        codeChangeHint: 'Vous pouvez personnaliser votre code de parrainage une seule fois.',
        codeAlreadyChanged: 'Votre code de parrainage a déjà été personnalisé.',
        codeUpdated: 'Code de parrainage mis à jour.',
        codeUpdateFailed: 'Échec de la mise à jour du code de parrainage !',
        invalidCodeLength: 'Le code doit contenir entre {{min}} et {{max}} caractères !',
        referralHistory: 'Historique des parrainages',
        periodToday: 'Aujourd\'hui',
        periodWeek: 'Semaine',
        periodMonth: 'Mois',
        periodYear: 'Année',
        periodAll: 'Tout',
        confirmChangeTitle: 'Modifier le code de parrainage',
        confirmChangeDescription: 'Êtes-vous sûr ? Cette action est permanente et irréversible. Vous ne pourrez plus modifier votre code de parrainage.',
        noReferralsYet: 'Aucun parrainage',
        noReferralsDescription: 'Partagez votre lien de parrainage pour commencer à gagner des récompenses.'
    }
} as const

export default fr