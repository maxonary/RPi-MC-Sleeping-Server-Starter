import { ISleepingServer } from "./sleepingServerInterface";
import { Player, PlayerConnectionCallBackType } from "./sleepingTypes";
import { Settings } from "./sleepingSettings";
import { Config, Server } from "@jsprismarine/prismarine";
import { Logger as PrismarineLogger } from "@jsprismarine/logger";
import { getLogger, LoggerType, getTransports } from "./sleepingLogger";

export class SleepingBedrock implements ISleepingServer {
  private settings: Settings;
  private playerConnectionCallBack: PlayerConnectionCallBackType;
  private logger: LoggerType;
  private server: Server;
  prismarineLogger: PrismarineLogger;

  constructor(
    settings: Settings,
    playerConnectionCallBack: PlayerConnectionCallBackType
  ) {
    this.logger = getLogger();
    this.settings = settings;
    this.playerConnectionCallBack = playerConnectionCallBack;

    const config = new Config();
    // Configure for sleeping server - disable world generation
    // Set a minimal world configuration to avoid generator errors
    try {
      // Try to configure world settings to prevent generator errors
      if (config.getWorlds) {
        const worlds = config.getWorlds();
        if (worlds && worlds.length > 0) {
          // Disable world loading for sleeping server
          worlds.forEach((world: any) => {
            if (world.generator) {
              world.generator = "flat"; // Use flat generator as fallback
            }
          });
        }
      }
    } catch (configError) {
      // Ignore config errors - we'll handle bootstrap errors instead
    }

    this.prismarineLogger = new PrismarineLogger("info", getTransports());
    (this.prismarineLogger as any).disable = () => {
      /* do not close the logger */
    };
    (this.prismarineLogger as any).logger = this.logger;

    this.server = new Server({
      config,
      logger: this.prismarineLogger,
      headless: true,
    });

    this.server.on("raknetConnect", (evt) => {
      this.logger.info(
        `[BedRock] A player connected ${
          this.settings.hideIpInLogs ? "" : evt.getRakNetSession().getAddress()
        }`
      );

      evt.getRakNetSession().disconnect(this.settings.loginMessage);
      evt.getRakNetSession().close();
      this.playerConnectionCallBack(Player.bedrock());
    });
  }

  init = async () => {
    try {
      this.logger.info(`[BedRock] Starting on ${this.settings.bedrockPort}`);
      // Bootstrap the server - this may throw a generator error but the connection listener should still work
      await this.server.bootstrap("0.0.0.0", this.settings.bedrockPort);
      this.logger.info(`[BedRock] Successfully started on port ${this.settings.bedrockPort}`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      // Generator errors are expected with JSPrismarine in headless mode
      // The connection listener (raknetConnect) should still work even if world generation fails
      if (errorMessage.includes("generator") || errorMessage.includes("overworld") || errorMessage.includes("Invalid generator")) {
        this.logger.warn(`[BedRock] World generation warning (expected for sleeping server): ${errorMessage}`);
        this.logger.info(`[BedRock] Connection listener should still be active - Bedrock players can connect to wake the server`);
        // Don't throw - allow the server to continue even with this error
        // The raknetConnect event handler should still work
      } else {
        this.logger.error(`[BedRock] Init error: ${errorMessage}`);
        // Re-throw non-generator errors as they're more serious
        throw err;
      }
    }
  };

  close = async () => {
    this.logger.info(`[BedRock] Closing...`);
    await this.server.shutdown({ stayAlive: true });
  };
}
