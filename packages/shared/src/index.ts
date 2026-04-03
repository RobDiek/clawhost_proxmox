import ApiError from '#shared/ApiError'
import API_PATHS from '#shared/apiPaths'
import EXTERNAL_URLS from '#shared/externalUrls'
import RequestClient from '#shared/RequestClient'
import authMethod from '#shared/authMethod'
import billingInterval from '#shared/billingInterval'
import clawFileType from '#shared/clawFileType'
import clawProvider from '#shared/clawProvider'
import clawStatus from '#shared/clawStatus'
import goLicense from '#shared/goLicense'
import INPUT_VALIDATION_LENGTH from '#shared/inputValidation'
import OPENCLAW_VERSION from '#shared/openclawVersion'
import userRole from '#shared/userRole'
import versionGatedFeature from '#shared/versionGatedFeature'
import {
    isFeatureSupported,
    isVersionSupported,
    SUPPORTED_VERSIONS
} from '#shared/supportedVersions'

export type { ApiEnvelope, RequestOptions, RequestConfig } from '#shared/types'

export {
    ApiError,
    API_PATHS as apiPaths,
    EXTERNAL_URLS as externalUrls,
    RequestClient,
    authMethod,
    billingInterval,
    clawFileType,
    clawProvider,
    clawStatus,
    goLicense,
    INPUT_VALIDATION_LENGTH as inputValidation,
    OPENCLAW_VERSION,
    userRole,
    versionGatedFeature,
    isFeatureSupported,
    isVersionSupported,
    SUPPORTED_VERSIONS
}