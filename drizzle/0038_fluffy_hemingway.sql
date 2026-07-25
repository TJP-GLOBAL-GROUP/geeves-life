CREATE TABLE `oauth_nonces` (
	`nonce` varchar(128) NOT NULL,
	`expiresAt` bigint NOT NULL,
	CONSTRAINT `oauth_nonces_nonce` PRIMARY KEY(`nonce`)
);
