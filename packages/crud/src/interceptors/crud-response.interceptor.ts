import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { isFalse, isObject, isFunction } from '@tbf-tools/util';
import { ClassTransformOptions, instanceToPlain, plainToInstance } from 'class-transformer';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { CrudActions } from '../enums';
import { SerializeOptions } from '../interfaces';
import { CrudBaseInterceptor } from './crud-base.interceptor';

const actionToDtoNameMap: {
  [key in CrudActions]: keyof SerializeOptions;
} = {
  [CrudActions.ReadAll]: 'getMany',
  [CrudActions.ReadOne]: 'get',
  [CrudActions.CreateMany]: 'createMany',
  [CrudActions.CreateOne]: 'create',
  [CrudActions.UpdateOne]: 'update',
  [CrudActions.ReplaceOne]: 'replace',
  [CrudActions.DeleteAll]: 'delete',
  [CrudActions.DeleteOne]: 'delete',
  [CrudActions.RecoverOne]: 'recover',
};

@Injectable()
export class CrudResponseInterceptor extends CrudBaseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(map((data) => this.serialize(context, data)));
  }

  protected transform(dto: any, data: any, options: ClassTransformOptions) {
    if (!isObject(data) || isFalse(dto)) {
      return data;
    }

    if (!isFunction(dto)) {
      return data.constructor !== Object ? instanceToPlain(data, options) : data;
    }

    if (data instanceof dto) {
      // Khi không có dto
      return instanceToPlain(data, options);
    }
    // Khi có dto
    return plainToInstance(dto, data, options);
  }

  protected serialize(context: ExecutionContext, data: any): any {
    const req = context.switchToHttp().getRequest();
    const { crudOptions, action } = this.getCrudInfo(context);
    const { serialize, classTransformOptions } = crudOptions;
    const dto = serialize[actionToDtoNameMap[action]];

    const isArray = Array.isArray(data);

    const options: ClassTransformOptions = classTransformOptions || {};
    /* istanbul ignore else */
    if (isFunction(crudOptions.auth?.classTransformOptions)) {
      const userOrRequest = crudOptions.auth.property ? req[crudOptions.auth.property] : req;
      Object.assign(options, crudOptions.auth.classTransformOptions(userOrRequest));
    }

    /* istanbul ignore else */
    if (isFunction(crudOptions.auth?.groups)) {
      const userOrRequest = crudOptions.auth.property ? req[crudOptions.auth.property] : req;
      options.groups = crudOptions.auth.groups(userOrRequest);
    }

    switch (action) {
      case CrudActions.ReadAll:
        return isArray
          ? (data as any[]).map((item) => this.transform(serialize.get, item, options))
          : this.transform(dto, data, options);
      case CrudActions.CreateMany:
        return isArray
          ? (data as any[]).map((item) => this.transform(dto, item, options))
          : this.transform(dto, data, options);
      default:
        return this.transform(dto, data, options);
    }
  }
}
