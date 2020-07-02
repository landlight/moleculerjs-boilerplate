//#region Global Imports
import fs from 'fs';
import { JWK, JWKS, JSONWebKeySet } from 'jose';
import { Errors } from 'moleculer';
//#endregion Global Imports

//#region Config Imports
import { NODE_ENV, ApplicationEnvironments } from '@Config';
//#endregion Config Imports

enum EncryptionAlgorithm {
  RS256 = 'RS256',
  RS384 = 'RS384',
  RS512 = 'RS512'
}

type JWTKey = JWK.RSAKey | JWK.ECKey | JWK.OKPKey | JWK.OctKey;

/**
 * JWTKeyStore is meant to be a singleton class implemented by the JWKS service.
 * 
 * It exposes one public method `getJWKS` which returns the key set stored in the private key store.
 */
export class JWTKeyStore {
  private _keyStore: JWKS.KeyStore;

  /**
   * Returns a generated RSA key and saves it to a local .pem file at the defined path.
   * @param path
   * @param algorithm
   */
  public static createRSAKey(algorithm: EncryptionAlgorithm): JWK.RSAKey {
    const rsaKey = JWK.generateSync('RSA', 2048, { alg: algorithm, use: 'sig' }, true);

    if (JWTKeyStore.isRSAKey(rsaKey)) {
      return rsaKey;
    } else {
      throw new Errors.MoleculerError(
        'Generated RSA key is invalid.',
        500,
        'ERR_BAD_IMPLEMENTATION',
      );
    }
  };

  /**
   * Returns an RSA key by either reading it from and env var, file, or generating one from scratch.
   * @param jwtKey
   * @param path
   * @param algorithm
   */
  public static getRSAKey(
    jwtKey: string | undefined,
    path: string | undefined,
    algorithm: EncryptionAlgorithm,
  ): JWK.RSAKey {
    if (jwtKey) {
      return JWTKeyStore.parseRSAKey(jwtKey, algorithm);
    } else if (!path) {
      throw new Errors.MoleculerError(
        `RSA key path is undefined.`,
        500,
        'ERR_BAD_IMPLEMENTATION',
      );
    } else if (NODE_ENV !== ApplicationEnvironments.PROD) {
      try {
        return JWTKeyStore.readRSAKey(path);
      } catch (error) {
        let rsaKey = JWTKeyStore.createRSAKey(algorithm);
        JWTKeyStore.saveRSAKey(path, rsaKey);
        return rsaKey;
      }
    } else {
      throw new Errors.MoleculerError(
        'RSA key generation in production is not allowed.',
        500,
        'ERR_BAD_IMPLEMENTATION',
      );
    }
  };

  /**
   * Checks that a given key is an RSA key.
   * @param key
   */
  public static isRSAKey(key: JWTKey): key is JWK.RSAKey {
    return JWK.isKey(key) && key.kty !== undefined && key.kty === 'RSA';
  };

  /**
   * Checks that a given key algorithm value is allowed.
   * @param algorithm
   */
  public static isAlgorithm(algorithm: string): algorithm is EncryptionAlgorithm {
    return Object.values(EncryptionAlgorithm).includes(algorithm as EncryptionAlgorithm);
  }

  /**
   * Parses an RSA key fom a string and verfies it.
   * @param jwtKey
   * @param algorithm
   */
  public static parseRSAKey(jwtKey: string, algorithm: EncryptionAlgorithm): JWK.RSAKey {
    try {
      const rsaKey = JWK.asKey(jwtKey, { alg: algorithm });
      rsaKey.toPEM(true);
      return rsaKey as JWK.RSAKey;
    } catch (error) {
      throw new Errors.MoleculerError(
        'Invalid RSA private key in the JWT_KEY environment variable.',
        500,
        'ERR_BAD_IMPLEMENTATION',
      );
    }
  };

  /**
   * Reads and RSA key from the defined path and verifies it.
   * @param path
   */
  public static readRSAKey(path: string): JWK.RSAKey {
    const file = fs.readFileSync(path);
    const rsaKey = JWK.asKey(file);
    if (JWTKeyStore.isRSAKey(rsaKey)) {
      return rsaKey;
    } else {
      throw new Errors.MoleculerError(
        `Invalid RSA private key retrieved from ${path}.`,
        500,
        'ERR_BAD_IMPLEMENTATION',
      );
    }
  };

  /**
   * Save an rsa key to the given file path.
   * @param path 
   * @param rsaKey 
   */
  public static saveRSAKey(path: string, rsaKey: JWK.RSAKey): void {
    try {
      fs.writeFileSync(path, rsaKey.toPEM(true));
    } catch (error) {
      throw new Errors.MoleculerError(
        `Error encountered while writing RSA key to ${path}. ${error}`,
        500,
        'ERR_BAD_IMPLEMENTATION',
      );
    }
  }

  /**
   * Creating a new instance of JWTKeyStore creates an empty key store that is exposed via the public `getJWKS` method.
   */
  constructor() {
    this._keyStore = new JWKS.KeyStore();
  }

  /**
   * Adding a key to the key store makes it fetchable via `getJWKS`.
   * 
   * Only RSA keys are addable to the keystore.
   * 
   * If jwtKey is undefined a key will be generated, this is useful during testing and development.
   * 
   * In production jwtKey should be defined via an environment variable.
   * 
   * @param jwtKey 
   * @param keyPath 
   * @param algorithm 
   */
  public addKey(jwtKey: string | undefined, keyPath: string | undefined, algorithm: string): void {
    let rsaKey: JWK.RSAKey;

    if (JWTKeyStore.isAlgorithm(algorithm)) {
      rsaKey = JWTKeyStore.getRSAKey(jwtKey, keyPath, algorithm);
    } else {
      throw new Errors.MoleculerError(
        `Invalid JWT algorithm: ${algorithm}`,
        500,
        'ERR_BAD_IMPLEMENTATION',
      );
    }

    if (JWTKeyStore.isRSAKey(rsaKey)) {
      this._keyStore.add(rsaKey);
    } else {
      throw new Errors.MoleculerError(
        'JWKS is not implemented on this server.',
        501,
        'ERR_NOT_IMPLEMENTED',
      );
    }
  }

  /**
   * public method meant to be used by services to get the JSONWebKeySet stored in the private key store
   */
  public getJWKS(): JSONWebKeySet {
    /**
     * keystore.toJWKS([private])
     * Exports the keystore to a JSON Web Key Set formatted object.
     * private: <boolean> When true exports private keys with their private components. Default: 'false'
     * Returns: <JSONWebKeySet>
     */
    return this._keyStore.toJWKS();
  }
}