import IAgentCreateOptions from "@secret-agent/client/interfaces/IAgentCreateOptions";
import {BlockedResourceType, Handler} from "secret-agent";
import AgentTaskResult from "./types/AgentTaskResult";
import AsyncFunction from "./helpers/AsyncFuncion";
import {TaskStatus} from "./enum/TaskStatus";
import TaskTimings from "./TaskTimings";
import Config from "./types/Config";

export default class AgentsPoolHandler {
    private handler: Handler;
    private config: Config;

    public constructor(config: Config) {
        this.config = config;

        this.handler = new Handler({
            maxConcurrency: this.config.MAX_CONCURRENCY,
            agentTimeoutMillis: this.config.DEFAULT_SESSION_TIMEOUT,
        });
    }

    public async process(script: string, options: IAgentCreateOptions): Promise<any> {
        if (options.blockedResourceTypes === undefined) {
            let blockedResourceTypes: BlockedResourceType[] = [];

            this.config.DEFAULT_BLOCKED_RESOURCE_TYPES.forEach((blockedResName: string) => {
                blockedResourceTypes.push(<BlockedResourceType>blockedResName)
            });

            options.blockedResourceTypes = blockedResourceTypes;
        }

        if (options.upstreamProxyUrl === undefined && process.env.UPSTREAM_PROXY !== undefined) {
            options.upstreamProxyUrl = process.env.UPSTREAM_PROXY;
        }

        const taskResult: AgentTaskResult = {
            timings: new TaskTimings(),
            session: null,
            status: TaskStatus.CREATED,
            output: null
        }

        const agent = await this.handler.createAgent(options);
        taskResult.session = await agent.sessionId;
        taskResult.timings.begin();

        (new Promise((resolve, reject) => {
            setTimeout(() => reject('Script Session Timeout Error'), this.config.DEFAULT_SESSION_TIMEOUT);
        }))
            .catch((exception: any) => {
                agent?.close();
                taskResult.timings.end();
                taskResult.status = TaskStatus.FAILED;
                taskResult.error = exception.toString();
                return taskResult;
            })

        try {
            const runtime = new AsyncFunction('agent', script);
            await runtime(agent);
            taskResult.status = TaskStatus.DONE;
        }
        catch (exception: any) {
            taskResult.status = TaskStatus.FAILED;
            taskResult.error = exception.toString();
        }
        finally {
            taskResult.output = agent.output;
            taskResult.timings.end();
            agent?.close();
        }

        return taskResult;
    }

}