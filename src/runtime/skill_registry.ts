interface Argument {
  desc?: string;
  default?: any;
  required: boolean;
}

interface HandlerResult {
  ok: boolean;
  output: string;
}

type Arguments = { [name: string]: Argument };
type FuncArgs<A extends Arguments> = { [name in keyof A]: A[name]['default'] | undefined };
type Handler<A extends Arguments> = (bot: any, args: FuncArgs<A>) => Promise<HandlerResult>;

interface Skill<A extends Arguments> {
  name: string;
  description: string;
  args: A;
  handler: Handler<A>;
}

class SkillRegistry {
  private skills: Map<string, Skill<Arguments>>;

  constructor() {
    this.skills = new Map();
  }

  public register(skill: Skill<Arguments>) {
    this.skills.set(skill.name, skill);
  }

  public get(name: string) {
    return this.skills.get(name);
  }

  public list() {
    return Array.from(this.skills.values()).map(skill => ({
      name: skill.name,
      description: skill.description,
      args: skill.args
    }));
  }
}

module.exports = new SkillRegistry();
