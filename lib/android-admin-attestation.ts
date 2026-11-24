import { X509Certificate, createHash, verify } from 'node:crypto';
import { AsnParser } from '@peculiar/asn1-schema';
import { AttestationApplicationId, KeyDescription, SecurityLevel, VerifiedBootState, id_ce_keyDescription } from '@peculiar/asn1-android';
import { Certificate } from '@peculiar/asn1-x509';

// Google Android Hardware Attestation public keys, from the official trust
// anchors at https://android.googleapis.com/attestation/root. Older Android
// phones carry earlier certificates for the same RSA root key. Pin the SPKI
// rather than only the newest certificate; Google explicitly retains those
// earlier anchors, including the expired 2016 root certificate.
const rootPublicKeys = new Set([
  'feb2ea7551ee316ed4bb443c8293b884dbfdea40b603ee3e4f4a897e4580fbae',
  '3ee44512a1af2beb39c889490c60ea3f82e43f5d5a5532f5ab9419f676cd07ec',
]);
export function isTrustedAndroidRoot(root:X509Certificate) {
  const digest=createHash('sha256').update(root.publicKey.export({type:'spki',format:'der'})).digest('hex');
  return root.ca && rootPublicKeys.has(digest) && root.verify(root.publicKey);
}
const signingDigest = 'c9d42524bd833a76c82db7c3c28ecd741901f84614f6a987ac4853c1017c218f';
const hardware = (level: SecurityLevel) => level === SecurityLevel.trustedEnvironment || level === SecurityLevel.strongBox;

export type AndroidProofFailure='root_untrusted'|'certificate_revoked'|'certificate_expired'|'chain_signature_invalid'|'attestation_extension_invalid'|'leaf_key_invalid'|'challenge_mismatch'|'hardware_untrusted'|'boot_unverified'|'key_policy_invalid'|'app_identity_missing'|'app_identity_mismatch'|'proof_signature_invalid';
export function verifyAndroidProof(chain: string[], challenge: string, signature: string, revoked: Record<string, unknown>, report?:(reason:AndroidProofFailure)=>void) {
  const reject=(reason:AndroidProofFailure)=>{report?.(reason);return false;};
  const certificates = chain.map(value => new X509Certificate(Buffer.from(value, 'base64')));
  const root = certificates.at(-1)!;
  if (!isTrustedAndroidRoot(root)) return reject('root_untrusted');
  const now = Date.now();
  for (const [index, cert] of certificates.entries()) {
    const issuer = certificates[index + 1];
    if (cert.serialNumber.toLowerCase().replace(/^0+/, '') in revoked) return reject('certificate_revoked');
    if (cert !== root && (now < Date.parse(cert.validFrom) || now >= Date.parse(cert.validTo))) return reject('certificate_expired');
    if (issuer && (!issuer.ca || !cert.checkIssued(issuer) || !cert.verify(issuer.publicKey))) return reject('chain_signature_invalid');
  }

  const descriptions = certificates.map(cert => AsnParser.parse(cert.raw, Certificate)
    .tbsCertificate.extensions?.filter(ext => ext.extnID === id_ce_keyDescription) ?? []);
  // Reject chains where the attestation belongs to a parent or appears twice.
  if (descriptions[0].length !== 1 || descriptions.slice(1).some(ext => ext.length)) return reject('attestation_extension_invalid');
  const leaf = certificates[0];
  if (leaf.ca || leaf.publicKey.asymmetricKeyType !== 'ec') return reject('leaf_key_invalid');
  const description = AsnParser.parse(descriptions[0][0].extnValue.buffer, KeyDescription);
  if (!Buffer.from(description.attestationChallenge.buffer).equals(Buffer.from(challenge, 'hex'))) return reject('challenge_mismatch');
  const trust = description.teeEnforced.rootOfTrust;
  if (!hardware(description.attestationSecurityLevel) || !hardware(description.keymasterSecurityLevel)) return reject('hardware_untrusted');
  if (!trust?.deviceLocked || trust.verifiedBootState !== VerifiedBootState.verified) return reject('boot_unverified');
  if (description.teeEnforced.origin !== 0 || !description.teeEnforced.purpose?.includes(2)) return reject('key_policy_invalid');
  const appId = description.softwareEnforced.attestationApplicationId ?? description.teeEnforced.attestationApplicationId;
  if (!appId) return reject('app_identity_missing');
  const app = AsnParser.parse(appId.buffer, AttestationApplicationId);
  if (app.packageInfos.length !== 1 || app.signatureDigests.length !== 1 ||
      Buffer.from(app.packageInfos[0].packageName.buffer).toString('utf8') !== 'com.espressoulster.coffee' ||
      Number(app.packageInfos[0].version) < 6 ||
      Buffer.from(app.signatureDigests[0].buffer).toString('hex') !== signingDigest) return reject('app_identity_mismatch');
  return verify('sha256', Buffer.from('Espressoulster Android admin v1:' + challenge), leaf.publicKey, Buffer.from(signature, 'base64')) || reject('proof_signature_invalid');
}
