SET
  SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";

START TRANSACTION;

SET
  time_zone = "+00:00";

USE database_metawave;

-- Create Tables
CREATE TABLE notfiy_signalgroups (
    id INT AUTO_INCREMENT PRIMARY KEY,
    group_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

COMMIT;