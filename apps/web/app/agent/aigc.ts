export type CommandType = 'ADD_NODE' | 'ADD_EDGE' | 'UPDATE_NODE' | 'DELETE_NODE';

export interface Command {
    type: CommandType;
    payload: unknown;
}

export interface AIGCResponse {
    text: string;
    commands: Command[];
}
