package com.runotify

import android.app.Application
import android.util.Log
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.facebook.react.modules.network.OkHttpClientProvider
import java.net.Socket
import java.security.KeyStore
import java.security.cert.CertificateException
import java.security.cert.CertificateFactory
import java.security.cert.X509Certificate
import java.util.Date
import javax.net.ssl.SSLContext
import javax.net.ssl.SSLEngine
import javax.net.ssl.X509ExtendedTrustManager

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // Packages that cannot be autolinked yet can be added manually here, for example:
          // add(MyReactNativePackage())
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    configureTrustedHttpClient()
    loadReactNative(this)
  }

  /**
   * Some Android devices' system trust store doesn't carry GlobalSign Root R46 yet,
   * which is what ufrgs.br's certificate chains to (via RNP's ICPEdu CA). Chrome ships
   * its own root store so it's unaffected, but OkHttp (used by fetch/XHR here) hits
   * "Trust anchor for certification path not found" on those devices.
   *
   * Two textbook fixes were tried and confirmed NOT to work on this device (a Samsung
   * Galaxy A16): a Network Security Config base-config/domain-config declaring this CA
   * as an extra trust anchor, and a custom TrustManagerFactory/PKIXParameters/
   * CertPathValidator built from Android's raw "AndroidCAStore" plus this CA. Both route
   * through platform certificate-validation machinery that Samsung Knox intercepts here
   * (confirmed via `android.sec.enterprise.certificate.DelegatingCertPathValidator`
   * showing up in the rejection's stack trace), which appears to restrict which CAs are
   * accepted regardless of what the app declares. So instead, this validates the chain
   * by hand — plain signature verification (X509Certificate.verify), not a security
   * provider's trust decision — which Knox has no hook into.
   */
  private fun configureTrustedHttpClient() {
    try {
      fun loadCert(resId: Int): X509Certificate =
        resources.openRawResource(resId).use { certStream ->
          CertificateFactory.getInstance("X.509").generateCertificate(certStream) as X509Certificate
        }
      val extraRootCert = loadCert(R.raw.globalsign_root_r46)
      val extraIntermediateCert = loadCert(R.raw.rnp_icpedu_intermediate)
      val trustManager = ExtraCaTrustManager(extraRootCert, listOf(extraIntermediateCert))

      val sslContext = SSLContext.getInstance("TLS")
      sslContext.init(null, arrayOf(trustManager), null)

      OkHttpClientProvider.setOkHttpClientFactory {
        OkHttpClientProvider.createClientBuilder(applicationContext)
          .sslSocketFactory(sslContext.socketFactory, trustManager)
          .build()
      }
    } catch (error: Exception) {
      Log.w("RUNotify", "Falha ao configurar trust anchor extra para o OkHttp", error)
    }
  }
}

/**
 * Validates certificate chains against Android's own system CA store (read directly
 * from the raw "AndroidCAStore" KeyStore) plus one extra trusted root, by manually
 * checking signatures link-by-link instead of delegating to a security provider's
 * path validator (see the class doc on [MainApplication] for why).
 *
 * ufrgs.br's server doesn't always send its intermediate CA certificate along with
 * the leaf (observed: some connections get only the leaf cert, no chain at all) — a
 * server-side quirk Chrome papers over by auto-fetching missing intermediates, which
 * OkHttp/Conscrypt don't do. [bridgeCerts] are extra intermediate certificates this
 * class can splice into an incomplete chain to bridge it up to a trusted root.
 */
private class ExtraCaTrustManager(
  extraRootCert: X509Certificate,
  private val bridgeCerts: List<X509Certificate>,
) : X509ExtendedTrustManager() {
  private val trustAnchorCerts: List<X509Certificate>

  init {
    val certs = mutableListOf<X509Certificate>()
    val androidCaStore = KeyStore.getInstance("AndroidCAStore")
    androidCaStore.load(null, null)
    val aliases = androidCaStore.aliases()
    while (aliases.hasMoreElements()) {
      val cert = androidCaStore.getCertificate(aliases.nextElement()) as? X509Certificate
      if (cert != null) {
        certs.add(cert)
      }
    }
    certs.add(extraRootCert)
    trustAnchorCerts = certs
  }

  private fun isTrustAnchor(cert: X509Certificate) =
    trustAnchorCerts.any { it.publicKey == cert.publicKey && it.subjectX500Principal == cert.subjectX500Principal }

  private fun validate(chain: Array<out X509Certificate>) {
    if (chain.isEmpty()) {
      throw CertificateException("Empty certificate chain")
    }

    // Complete the path the server sent (which may be just the leaf cert) by
    // walking up via bridge certs and/or trust anchors until it reaches one.
    val fullPath = chain.toMutableList()
    while (!isTrustAnchor(fullPath.last())) {
      val issuerName = fullPath.last().issuerX500Principal
      val next =
        bridgeCerts.find { it.subjectX500Principal == issuerName }
          ?: trustAnchorCerts.find { it.subjectX500Principal == issuerName }
          ?: throw CertificateException(
            "Path does not chain to any trusted anchor: no issuer found for " +
              "${fullPath.last().subjectX500Principal}",
          )
      if (fullPath.any { it.subjectX500Principal == next.subjectX500Principal }) {
        throw CertificateException("Certificate chain loop detected")
      }
      fullPath.add(next)
    }

    val now = Date()
    for (cert in fullPath) {
      cert.checkValidity(now)
    }
    for (i in 0 until fullPath.size - 1) {
      try {
        fullPath[i].verify(fullPath[i + 1].publicKey)
      } catch (error: Exception) {
        throw CertificateException("Broken chain link at index $i", error)
      }
    }
  }

  override fun checkClientTrusted(chain: Array<out X509Certificate>, authType: String) = validate(chain)

  override fun checkClientTrusted(chain: Array<out X509Certificate>, authType: String, socket: Socket) =
    validate(chain)

  override fun checkClientTrusted(chain: Array<out X509Certificate>, authType: String, engine: SSLEngine) =
    validate(chain)

  override fun checkServerTrusted(chain: Array<out X509Certificate>, authType: String) = validate(chain)

  override fun checkServerTrusted(chain: Array<out X509Certificate>, authType: String, socket: Socket) =
    validate(chain)

  override fun checkServerTrusted(chain: Array<out X509Certificate>, authType: String, engine: SSLEngine) =
    validate(chain)

  override fun getAcceptedIssuers(): Array<X509Certificate> = trustAnchorCerts.toTypedArray()
}
